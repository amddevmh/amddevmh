import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { addDays, nightsBetween, roundMoney } from '@hi/core'
import { createAdminClient } from '@hi/db/admin'
import type { Json } from '@hi/db'
import {
  HOTEL_PROVIDER_CODES, getHotelProvider, maskForLog, searchProviders,
  type HotelSearchParams, type NormalizedHotelOffer, type SimulationMode,
} from '@hi/integrations/hotels'
import { HOTEL_CITIES } from './hotel-constants'
import { todayTunis } from './forms'
import { t } from './i18n'

/**
 * Recherche hôtelière Tunisie (FO05, API01–API04) — exécutée UNIQUEMENT côté serveur.
 * Le client « service role » sert exclusivement à lire l'état des connecteurs et la majoration,
 * et à écrire le journal technique api_call_logs (données masquées).
 * Ni identifiants ni réponses brutes ne sont transmis au navigateur.
 */

export interface HotelQuery {
  city: string
  checkIn: string
  checkOut: string
  adults: number
  children: number
  rooms: number
  board?: string
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const hotelQuerySchema = z.object({
  city: z.enum(HOTEL_CITIES, t.hotels.errors.city),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.coerce.number().int().min(1).max(12),
  children: z.coerce.number().int().min(0).max(8).default(0),
  rooms: z.coerce.number().int().min(1).max(6).default(1),
  board: z.enum(['LPD', 'DP', 'PC', 'ALL', '']).optional().transform((v) => v || undefined),
}).superRefine((q, ctx) => {
  if (q.checkIn < todayTunis()) ctx.addIssue({ code: 'custom', path: ['checkIn'], message: t.hotels.errors.past })
  if (q.checkOut <= q.checkIn) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: t.hotels.errors.dates })
  else if (nightsBetween(q.checkIn, q.checkOut) > 30) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: t.hotels.errors.tooLong })
  if (q.rooms > q.adults) ctx.addIssue({ code: 'custom', path: ['rooms'], message: t.hotels.errors.occupancy })
})

/** Lecture des paramètres d'URL (/hotels?ville=…&arrivee=…). */
export function parseHotelSearchParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined
  if (!one('ville')) return { submitted: false as const }
  const parsed = hotelQuerySchema.safeParse({
    city: one('ville'), checkIn: one('arrivee'), checkOut: one('depart'),
    adults: one('adultes') ?? 2, children: one('enfants') ?? 0, rooms: one('chambres') ?? 1, board: one('pension') ?? '',
  })
  if (!parsed.success) {
    return { submitted: true as const, errors: Array.from(new Set(parsed.error.issues.map((i) => i.message))) }
  }
  return { submitted: true as const, query: parsed.data as HotelQuery }
}

/** Offre normalisée publiable : sans réponse brute, avec prix de vente. */
export interface PublicHotelOffer {
  provider: string
  providerHotelCode: string
  hotelName: string
  city: string
  roomType: string
  board: string
  boardLabelOriginal: string
  nights: number
  checkIn: string
  checkOut: string
  salePrice: number
  currency: string
  taxesIncluded: boolean
  touristTax: number | null
  refundable: boolean
  cancellationPolicy: string
  available: boolean
  remaining: number | null
  offerRef: string
  fetchedAt: string
}

export interface PublicHotel {
  key: string
  provider: string
  providerLabel: string
  code: string
  name: string
  city: string
  offers: PublicHotelOffer[]
  minPrice: number | null
}

export interface HotelSearchResult {
  fetchedAt: string
  providers: Array<{ code: string; status: 'success' | 'error' | 'timeout' | 'unavailable' | 'disabled' }>
  hotels: PublicHotel[]
}

interface ConnectorState { code: string; enabled: boolean; simulate?: SimulationMode }

async function getConnectors(): Promise<ConnectorState[]> {
  const { data } = await createAdminClient()
    .from('integration_connectors')
    .select('code, enabled, config')
    .in('code', [...HOTEL_PROVIDER_CODES])
  return HOTEL_PROVIDER_CODES.map((code) => {
    const row = data?.find((r) => r.code === code)
    const sim = (row?.config as { simulate?: SimulationMode } | null)?.simulate
    return { code, enabled: !!row?.enabled, simulate: sim }
  })
}

/** Majoration de vente (paramètre hotel_markup_pct, 10 % par défaut). */
export async function getMarkupPct(): Promise<number> {
  const { data } = await createAdminClient().from('app_settings').select('value').eq('key', 'hotel_markup_pct').maybeSingle()
  const v = data?.value as unknown
  const n = typeof v === 'number' ? v : typeof v === 'object' && v && 'pct' in v ? Number((v as { pct: unknown }).pct) : NaN
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 10
}

export function salePrice(amount: number, markupPct: number) {
  return roundMoney(amount * (1 + markupPct / 100))
}

function toPublic(o: NormalizedHotelOffer, markup: number): PublicHotelOffer {
  return {
    provider: o.provider,
    providerHotelCode: o.providerHotelCode,
    hotelName: o.providerHotelName,
    city: o.city,
    roomType: o.roomType,
    board: o.board,
    boardLabelOriginal: o.boardLabelOriginal,
    nights: o.nights,
    checkIn: o.checkIn,
    checkOut: o.checkOut,
    salePrice: salePrice(o.price.amount, markup),
    currency: o.price.currency,
    taxesIncluded: o.price.taxesIncluded,
    touristTax: o.price.touristTax,
    refundable: o.refundable,
    cancellationPolicy: o.cancellationPolicy,
    available: o.available,
    remaining: o.remaining,
    offerRef: o.offerRef,
    fetchedAt: o.fetchedAt,
  }
}

async function logCall(entry: {
  connector: string; operation: string; status: 'success' | 'error' | 'timeout' | 'unavailable'
  durationMs: number; request: unknown; response?: unknown; error?: string
}) {
  try {
    await createAdminClient().from('api_call_logs').insert({
      connector_code: entry.connector,
      operation: entry.operation,
      request_id: randomUUID(),
      status: entry.status,
      duration_ms: entry.durationMs,
      request_summary: maskForLog(entry.request) as Json,
      response_summary: (entry.response == null ? null : maskForLog(entry.response)) as Json,
      error_message: entry.error ?? null,
    })
  } catch {
    // Le journal ne doit jamais bloquer la recherche
  }
}

function providerParams(q: HotelQuery): HotelSearchParams {
  return { city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, adults: q.adults, children: q.children, rooms: q.rooms }
}

/** Recherche sur les deux fournisseurs indépendants ; la panne de l'un n'empêche pas l'autre. */
export async function searchHotels(q: HotelQuery): Promise<HotelSearchResult> {
  const [connectors, markup] = await Promise.all([getConnectors(), getMarkupPct()])
  const enabled = connectors.filter((c) => c.enabled)
  const params = providerParams(q)
  const outcomes = await searchProviders(enabled.map((c) => getHotelProvider(c.code, { simulate: c.simulate ?? 'ok' })), params)

  await Promise.all(outcomes.map((o) => logCall({
    connector: o.provider, operation: 'search', status: o.status, durationMs: o.durationMs,
    request: params, response: { offers: o.offers.length }, error: o.error,
  })))

  const hotels = new Map<string, PublicHotel>()
  for (const outcome of outcomes) {
    for (const offer of outcome.offers) {
      if (q.board && offer.board !== q.board) continue
      const key = `${offer.provider}:${offer.providerHotelCode}`
      let h = hotels.get(key)
      if (!h) {
        h = {
          key, provider: offer.provider, providerLabel: t.hotels.providerLabels[offer.provider] ?? offer.provider,
          code: offer.providerHotelCode, name: offer.providerHotelName, city: offer.city, offers: [], minPrice: null,
        }
        hotels.set(key, h)
      }
      h.offers.push(toPublic(offer, markup))
    }
  }
  const list = [...hotels.values()].map((h) => {
    h.offers.sort((a, b) => Number(b.available) - Number(a.available) || a.salePrice - b.salePrice)
    const avail = h.offers.filter((o) => o.available)
    h.minPrice = avail.length ? Math.min(...avail.map((o) => o.salePrice)) : null
    return h
  }).sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity))

  return {
    fetchedAt: new Date().toISOString(),
    providers: connectors.map((c) => ({ code: c.code, status: c.enabled ? outcomes.find((o) => o.provider === c.code)?.status ?? 'error' : 'disabled' })),
    hotels: list,
  }
}

export const recheckInputSchema = z.object({
  provider: z.enum(HOTEL_PROVIDER_CODES),
  offerRef: z.string().min(3).max(200),
  city: z.enum(HOTEL_CITIES),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.coerce.number().int().min(1).max(12),
  children: z.coerce.number().int().min(0).max(8),
  rooms: z.coerce.number().int().min(1).max(6),
})
export type RecheckInput = z.infer<typeof recheckInputSchema>

export type RecheckOutcome =
  | { status: 'available'; offer: PublicHotelOffer }
  | { status: 'unavailable'; offer: PublicHotelOffer | null }
  | { status: 'error' }

/** Revérification du prix et de la disponibilité auprès du fournisseur, juste avant la demande (API02, REC50). */
export async function recheckOffer(input: RecheckInput): Promise<RecheckOutcome> {
  const connectors = await getConnectors()
  const c = connectors.find((x) => x.code === input.provider)
  if (!c?.enabled) return { status: 'error' }
  const markup = await getMarkupPct()
  const params: HotelSearchParams = {
    city: input.city, checkIn: input.checkIn, checkOut: input.checkOut, adults: input.adults, children: input.children, rooms: input.rooms,
  }
  const start = Date.now()
  try {
    const provider = getHotelProvider(c.code, { simulate: c.simulate ?? 'ok' })
    const res = await Promise.race([
      provider.recheck(input.offerRef, params),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Délai dépassé')), 5000)),
    ])
    await logCall({
      connector: c.code, operation: 'recheck', status: 'success', durationMs: Date.now() - start,
      request: { offerRef: input.offerRef, ...params }, response: { available: res.available, price: res.price, changed: res.changed },
    })
    const offer = res.offer ? toPublic(res.offer, markup) : null
    if (!res.available || !offer) return { status: 'unavailable', offer }
    return { status: 'available', offer }
  } catch (e) {
    const msg = (e as Error).message
    await logCall({
      connector: c.code, operation: 'recheck', status: /délai/i.test(msg) ? 'timeout' : 'unavailable', durationMs: Date.now() - start,
      request: { offerRef: input.offerRef, ...params }, error: msg,
    })
    return { status: 'error' }
  }
}

/** Valeurs par défaut du formulaire (dans 14 jours, 3 nuits). */
export function defaultDates() {
  const checkIn = addDays(todayTunis(), 14)
  return { checkIn, checkOut: addDays(checkIn, 3) }
}
