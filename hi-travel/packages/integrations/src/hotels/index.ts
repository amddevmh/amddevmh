import { MyGoProvider, MYGO_CODE } from './mygo'
import { TunisiabedsProvider, TUNISIABEDS_CODE } from './tunisiabeds'
import {
  ProviderTimeoutError, ProviderUnavailableError,
  type BookingRequest, type BookingResult, type HotelProvider, type HotelSearchParams, type NormalizedHotelOffer, type SimulationMode,
} from './types'

export * from './types'
export { MYGO_CODE, TUNISIABEDS_CODE }
export { setSimulation, resetMockProviders, providerState } from './mock-store'

export const HOTEL_PROVIDER_CODES = [TUNISIABEDS_CODE, MYGO_CODE] as const

/**
 * Fabrique des connecteurs. INTEGRATIONS_MODE=mock (défaut) → fournisseurs simulés.
 * Pour brancher les API réelles : implémenter HotelProvider et les retourner ici.
 */
export function getHotelProvider(code: string, options: { simulate?: SimulationMode; latencyMs?: number } = {}): HotelProvider {
  switch (code) {
    case TUNISIABEDS_CODE:
      return new TunisiabedsProvider(options)
    case MYGO_CODE:
      return new MyGoProvider(options)
    default:
      throw new Error(`Connecteur hôtel inconnu : ${code}`)
  }
}

export interface ProviderSearchOutcome {
  provider: string
  status: 'success' | 'error' | 'timeout' | 'unavailable'
  offers: NormalizedHotelOffer[]
  error?: string
  durationMs: number
}

function withTimeout<T>(p: Promise<T>, ms: number, provider: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new ProviderTimeoutError(provider, `Pas de réponse en ${ms} ms`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/**
 * Recherche sur plusieurs fournisseurs indépendants : la panne de l'un ne bloque pas l'autre (API01, REC25).
 * Les offres ne sont jamais fusionnées ni leurs stocks additionnés.
 */
export async function searchProviders(
  providers: HotelProvider[],
  params: HotelSearchParams | ((p: HotelProvider) => HotelSearchParams),
  timeoutMs = 4000,
): Promise<ProviderSearchOutcome[]> {
  return Promise.all(
    providers.map(async (p) => {
      const start = Date.now()
      try {
        const offers = await withTimeout(p.search(typeof params === 'function' ? params(p) : params), timeoutMs, p.code)
        return { provider: p.code, status: 'success' as const, offers, durationMs: Date.now() - start }
      } catch (e) {
        const status = e instanceof ProviderTimeoutError ? 'timeout' : e instanceof ProviderUnavailableError ? 'unavailable' : 'error'
        return { provider: p.code, status, offers: [], error: (e as Error).message, durationMs: Date.now() - start }
      }
    }),
  )
}

export type SafeBookingOutcome =
  | { kind: 'booked'; result: BookingResult; attempts: number }
  | { kind: 'to_verify'; reason: string; attempts: number }
  | { kind: 'failed'; reason: string; attempts: number }

/**
 * Réservation sans double envoi (API03) :
 * 1. si une demande a déjà été envoyée, on interroge d'abord le statut ;
 * 2. une expiration de délai ne signifie pas un échec → statut « à vérifier », aucune relance automatique.
 */
export async function bookSafely(provider: HotelProvider, req: BookingRequest, alreadySent: boolean): Promise<SafeBookingOutcome> {
  if (alreadySent) {
    const status = await provider.getBookingStatus(req.requestId)
    if (status.status !== 'unknown') return { kind: 'booked', result: status, attempts: 0 }
    if (!provider.capabilities.idempotencyKey) {
      return { kind: 'to_verify', reason: 'Statut inconnu chez un fournisseur sans idempotence : contrôle manuel avant nouvel envoi', attempts: 0 }
    }
  }
  try {
    const result = await provider.book(req)
    return result.status === 'failed'
      ? { kind: 'failed', reason: result.message ?? 'Refus du fournisseur', attempts: 1 }
      : { kind: 'booked', result, attempts: 1 }
  } catch (e) {
    if (e instanceof ProviderTimeoutError) {
      return { kind: 'to_verify', reason: `${e.message} — la réservation a pu aboutir : vérifier le statut avant toute nouvelle tentative`, attempts: 1 }
    }
    return { kind: 'failed', reason: (e as Error).message, attempts: 1 }
  }
}

/** Masque les données personnelles avant écriture dans le journal technique (API04). */
export function maskForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskForLog)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        /name|email|phone|passport|guest|card|token|key|secret/i.test(k) ? [k, typeof v === 'string' ? `${v.slice(0, 1)}***` : '***'] : [k, maskForLog(v)],
      ),
    )
  }
  return value
}
