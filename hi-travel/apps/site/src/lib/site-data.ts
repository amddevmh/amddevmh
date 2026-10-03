import 'server-only'
import { cache } from 'react'
import type { Activity, PriceBasis } from '@hi/core'
import { createPublicClient } from './supabase'

/**
 * Lecture des données publiques du site : UNIQUEMENT les vues publiques
 * (site_offers, site_departures, site_public_pages), le paramètre public « agency »
 * et les redirections. Aucune table de coûts, marges, notes internes ou voyageurs.
 */

export interface Agency {
  name: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  hours: string | null
  socials: { facebook?: string; instagram?: string; [k: string]: string | undefined }
}

export interface OfferPhoto { url: string; alt: string }
export interface ProgramDay { day: number; title: string; description?: string }
export interface OfferHotel { name: string; city?: string; nights?: number; board?: string }

export interface Offer {
  id: string
  slug: string
  title: string
  activity: Activity
  isOmra: boolean
  destination: string
  country: string | null
  durationDays: number | null
  nights: number | null
  summary: string | null
  program: ProgramDay[]
  hotels: OfferHotel[]
  board: string | null
  indicativeFlights: string | null
  inclusions: string[]
  exclusions: string[]
  conditions: string | null
  photos: OfferPhoto[]
  priceAmount: number | null
  priceBasis: PriceBasis
  occupancyBasis: string | null
  depositAmount: number | null
  currency: string
  ctaLabel: string
  featured: boolean
  sortOrder: number
  seoTitle: string | null
  seoDescription: string | null
  updatedAt: string | null
  nextDeparture: string | null
}

export type Availability = 'bookable' | 'full' | 'expired' | 'closed'

export interface Departure {
  id: string
  offerId: string
  code: string
  startDate: string
  endDate: string
  priceAdult: number | null
  priceChild: number | null
  priceInfant: number | null
  singleSupplement: number | null
  depositAmount: number | null
  currency: string
  bookingDeadline: string | null
  seatsAvailable: number
  availability: Availability
}

const DEFAULT_AGENCY: Agency = {
  name: 'HI Travel', email: null, phone: null, whatsapp: null, address: null, hours: null, socials: {},
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOffer(r: any): Offer {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    activity: r.activity,
    isOmra: !!r.is_omra,
    destination: r.destination ?? '',
    country: r.country,
    durationDays: r.duration_days,
    nights: r.nights,
    summary: r.summary,
    program: arr<ProgramDay>(r.program).filter((d) => d && typeof d.title === 'string'),
    hotels: arr<OfferHotel>(r.hotels).filter((h) => h && typeof h.name === 'string'),
    board: r.board,
    indicativeFlights: r.indicative_flights || null,
    inclusions: r.inclusions ?? [],
    exclusions: r.exclusions ?? [],
    conditions: r.conditions,
    photos: arr<OfferPhoto>(r.photos).filter((p) => p && typeof p.url === 'string' && /^https?:\/\//.test(p.url)),
    priceAmount: num(r.price_amount),
    priceBasis: (r.price_basis ?? 'from') as PriceBasis,
    occupancyBasis: r.occupancy_basis || null,
    depositAmount: num(r.deposit_amount),
    currency: r.currency ?? 'TND',
    ctaLabel: r.cta_label ?? 'Demander un devis',
    featured: !!r.featured,
    sortOrder: r.sort_order ?? 0,
    seoTitle: r.seo_title || null,
    seoDescription: r.seo_description || null,
    updatedAt: r.updated_at,
    nextDeparture: r.next_departure,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeparture(r: any): Departure {
  return {
    id: r.id,
    offerId: r.offer_id,
    code: r.code,
    startDate: r.start_date,
    endDate: r.end_date,
    priceAdult: num(r.price_adult),
    priceChild: num(r.price_child),
    priceInfant: num(r.price_infant),
    singleSupplement: num(r.single_supplement),
    depositAmount: num(r.deposit_amount),
    currency: r.currency ?? 'TND',
    bookingDeadline: r.booking_deadline,
    seatsAvailable: r.seats_available ?? 0,
    availability: (r.availability ?? 'closed') as Availability,
  }
}

/** Coordonnées administrables (paramètre public « agency »). */
export const getAgency = cache(async (): Promise<Agency> => {
  const { data, error } = await createPublicClient().from('app_settings').select('value').eq('key', 'agency').maybeSingle()
  if (error || !data) return DEFAULT_AGENCY
  const v = data.value as Partial<Agency> & { socials?: Record<string, string> }
  return { ...DEFAULT_AGENCY, ...v, socials: v.socials ?? {} }
})

/** Paramètre public « online_payment » (affichage des instructions de paiement manuel). */
export const getOnlinePaymentSetting = cache(async () => {
  const { data } = await createPublicClient().from('app_settings').select('value').eq('key', 'online_payment').maybeSingle()
  const v = (data?.value ?? {}) as { enabled?: boolean; manual_instructions?: string }
  return { enabled: !!v.enabled, manualInstructions: v.manual_instructions ?? null }
})

const OFFER_COLUMNS =
  'id, slug, title, activity, is_omra, destination, country, duration_days, nights, summary, program, hotels, board, indicative_flights, inclusions, exclusions, conditions, photos, price_amount, price_basis, occupancy_basis, deposit_amount, currency, cta_label, featured, sort_order, seo_title, seo_description, updated_at, next_departure'

const DEPARTURE_COLUMNS =
  'id, offer_id, code, start_date, end_date, price_adult, price_child, price_infant, single_supplement, deposit_amount, currency, booking_deadline, seats_available, availability'

export const getOffers = cache(async (): Promise<Offer[]> => {
  const { data, error } = await createPublicClient()
    .from('site_offers')
    .select(OFFER_COLUMNS)
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })
  if (error) throw new Error(`Lecture des offres impossible : ${error.message}`)
  return (data ?? []).map(mapOffer)
})

export const getOfferBySlug = cache(async (slug: string): Promise<Offer | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null
  const { data, error } = await createPublicClient().from('site_offers').select(OFFER_COLUMNS).eq('slug', slug).maybeSingle()
  if (error) throw new Error(`Lecture de l’offre impossible : ${error.message}`)
  return data ? mapOffer(data) : null
})

export const getDepartures = cache(async (offerId?: string): Promise<Departure[]> => {
  let q = createPublicClient().from('site_departures').select(DEPARTURE_COLUMNS).order('start_date', { ascending: true })
  if (offerId) q = q.eq('offer_id', offerId)
  const { data, error } = await q
  if (error) throw new Error(`Lecture des départs impossible : ${error.message}`)
  return (data ?? []).map(mapDeparture)
})

export async function getUpcomingDepartures(limit = 6): Promise<Array<Departure & { offer: Offer }>> {
  const [departures, offers] = await Promise.all([getDepartures(), getOffers()])
  const byId = new Map(offers.map((o) => [o.id, o]))
  return departures
    .filter((d) => d.availability === 'bookable' || d.availability === 'full')
    .flatMap((d) => {
      const offer = byId.get(d.offerId)
      return offer ? [{ ...d, offer }] : []
    })
    .slice(0, limit)
}

export interface PublicPage { slug: string; title: string; body: string; seoTitle: string | null; seoDescription: string | null; updatedAt: string | null }

export const getPublicPage = cache(async (slug: string): Promise<PublicPage | null> => {
  const { data, error } = await createPublicClient()
    .from('site_public_pages')
    .select('slug, title, body, seo_title, seo_description, updated_at')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !data) return null
  return {
    slug: data.slug!, title: data.title!, body: data.body ?? '',
    seoTitle: data.seo_title, seoDescription: data.seo_description, updatedAt: data.updated_at,
  }
})

export async function getPublicPages(): Promise<PublicPage[]> {
  const { data } = await createPublicClient().from('site_public_pages').select('slug, title, body, seo_title, seo_description, updated_at')
  return (data ?? []).map((d) => ({
    slug: d.slug!, title: d.title!, body: d.body ?? '', seoTitle: d.seo_title, seoDescription: d.seo_description, updatedAt: d.updated_at,
  }))
}

/** Redirection éditable (anciennes adresses utiles → nouvelles pages). */
export async function getRedirect(path: string): Promise<{ to: string; permanent: boolean } | null> {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path
  const candidates = Array.from(new Set([clean, `${clean}/`]))
  const { data } = await createPublicClient().from('site_redirects').select('from_path, to_path, permanent').in('from_path', candidates).limit(1)
  const row = data?.[0]
  if (!row) return null
  // Uniquement des redirections internes ou https explicites
  if (!row.to_path.startsWith('/') && !/^https:\/\//.test(row.to_path)) return null
  if (row.to_path.startsWith('//')) return null
  return { to: row.to_path, permanent: row.permanent }
}
