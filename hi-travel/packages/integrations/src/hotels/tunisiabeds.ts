/**
 * Fournisseur A — « Tunisiabeds » (simulé).
 * Format propre : hotels → rooms → boards, prix total TTC, clé d'idempotence native.
 */
import { nightsBetween } from '@hi/core'
import { providerState, seeded, sleep } from './mock-store'
import {
  ProviderTimeoutError, ProviderUnavailableError,
  type BookingRequest, type BookingResult, type HotelProvider, type HotelSearchParams,
  type NormalizedHotelOffer, type RecheckResult, type SimulationMode,
} from './types'

interface TbBoard { code: 'LPD' | 'DP' | 'PC' | 'AI'; label: string; price_total: number; currency: 'TND'; cancellable: boolean; policy: string; allotment: number }
interface TbRoom { code: string; name: string; boards: TbBoard[] }
interface TbHotel { code: string; name: string; city: string; stars: number; rooms: TbRoom[] }

const CATALOGUE = [
  { code: 'TB-HAM-001', name: 'Marina Palace Hammamet', city: 'Hammamet', stars: 4, base: 85 },
  { code: 'TB-HAM-002', name: 'Radisson Blu Hammamet', city: 'Hammamet', stars: 5, base: 160 },
  { code: 'TB-HAM-003', name: 'Paradis Palace', city: 'Hammamet', stars: 4, base: 78 },
  { code: 'TB-SOU-010', name: 'Mövenpick Sousse', city: 'Sousse', stars: 5, base: 150 },
  { code: 'TB-DJE-020', name: 'Radisson Blu Palace Djerba', city: 'Djerba', stars: 5, base: 140 },
]

const BOARD_MAP = { LPD: 'LPD', DP: 'DP', PC: 'PC', AI: 'ALL' } as const

/** Réponse brute simulée, dans le format du fournisseur. */
function rawSearch(p: HotelSearchParams, priceBump = 0): { hotels: TbHotel[] } {
  const nights = nightsBetween(p.checkIn, p.checkOut)
  const pax = p.adults + (p.children ?? 0) * 0.5
  const hotels = CATALOGUE
    .filter((h) => (p.hotelCodes?.length ? p.hotelCodes.includes(h.code) : !p.city || h.city.toLowerCase() === p.city.toLowerCase()))
    .map<TbHotel>((h) => ({
      code: h.code, name: h.name, city: h.city, stars: h.stars,
      rooms: [
        { code: 'DBL', name: 'Chambre Double Standard' },
        { code: 'FAM', name: 'Chambre Familiale' },
      ].map((room) => ({
        ...room,
        boards: (['LPD', 'DP', 'AI'] as const).map((b) => {
          const factor = { LPD: 1, DP: 1.25, AI: 1.6 }[b] * (room.code === 'FAM' ? 1.3 : 1)
          const variation = 0.9 + seeded(h.code, room.code, b, p.checkIn) * 0.2
          return {
            code: b,
            label: { LPD: 'Logement Petit Déjeuner', DP: 'Demi Pension', AI: 'All Inclusive' }[b],
            price_total: Math.round(h.base * factor * variation * nights * pax * 1000 + priceBump * 1000) / 1000,
            currency: 'TND' as const,
            cancellable: b !== 'AI' || seeded(h.code, 'nr') > 0.5,
            policy: b === 'AI' ? 'Annulation gratuite jusqu’à 7 jours avant l’arrivée' : 'Annulation gratuite jusqu’à 3 jours avant l’arrivée',
            allotment: Math.floor(seeded(h.code, room.code, b, p.checkIn, 'stock') * 6),
          }
        }),
      })),
    }))
  return { hotels }
}

function normalize(raw: { hotels: TbHotel[] }, p: HotelSearchParams): NormalizedHotelOffer[] {
  const fetchedAt = new Date().toISOString()
  const nights = nightsBetween(p.checkIn, p.checkOut)
  return raw.hotels.flatMap((h) =>
    h.rooms.flatMap((r) =>
      r.boards.map((b) => ({
        provider: TUNISIABEDS_CODE,
        providerHotelCode: h.code,
        providerHotelName: h.name,
        city: h.city,
        roomCode: r.code,
        roomType: r.name,
        board: BOARD_MAP[b.code],
        boardLabelOriginal: b.label,
        occupancy: { adults: p.adults, children: p.children ?? 0 },
        checkIn: p.checkIn,
        checkOut: p.checkOut,
        nights,
        price: { amount: b.price_total, currency: b.currency, taxesIncluded: true, touristTax: null },
        available: b.allotment > 0,
        remaining: b.allotment,
        refundable: b.cancellable,
        cancellationPolicy: b.policy,
        offerRef: `${h.code}|${r.code}|${b.code}|${p.checkIn}|${p.checkOut}`,
        original: { hotel: h.code, room: r.code, board: b },
        fetchedAt,
      })),
    ),
  )
}

export const TUNISIABEDS_CODE = 'hotel_api_tunisiabeds'

export class TunisiabedsProvider implements HotelProvider {
  readonly code = TUNISIABEDS_CODE
  readonly label = 'Tunisiabeds (simulé)'
  readonly capabilities = { search: true, book: true, confirm: true, voucher: true, modify: false, cancel: true, idempotencyKey: true }

  constructor(private options: { latencyMs?: number; simulate?: SimulationMode } = {}) {}

  private get simulate(): SimulationMode {
    return this.options.simulate ?? providerState(this.code).simulate
  }

  private async guard() {
    const latency = this.options.latencyMs ?? 120
    if (this.simulate === 'down') throw new ProviderUnavailableError(this.code, 'Tunisiabeds : service indisponible (503)')
    await sleep(this.simulate === 'slow' ? latency * 10 : latency)
  }

  async search(p: HotelSearchParams) {
    await this.guard()
    return normalize(rawSearch(p), p)
  }

  async recheck(offerRef: string, p: HotelSearchParams): Promise<RecheckResult> {
    await this.guard()
    const bump = this.simulate === 'price_change' ? 37.5 : 0
    const before = normalize(rawSearch(p), p).find((o) => o.offerRef === offerRef) ?? null
    const now = normalize(rawSearch(p, bump), p).find((o) => o.offerRef === offerRef) ?? null
    return {
      available: !!now?.available,
      price: now?.price.amount ?? null,
      currency: now?.price.currency ?? null,
      changed: !!before && !!now && before.price.amount !== now.price.amount,
      offer: now,
    }
  }

  async book(req: BookingRequest): Promise<BookingResult> {
    await this.guard()
    const s = providerState(this.code)
    s.bookCalls++
    // Idempotence native : même requestId → même réservation
    const existing = s.bookings.get(req.requestId)
    if (existing) {
      return { status: existing.status === 'cancelled' ? 'failed' : existing.status, externalRef: existing.externalRef, amount: existing.amount, currency: existing.currency, conditions: null }
    }
    const externalRef = `TB${Date.now().toString(36).toUpperCase()}${Math.floor(seeded(req.requestId) * 1000)}`
    s.bookings.set(req.requestId, {
      requestId: req.requestId, externalRef, amount: req.expectedAmount, currency: 'TND', createdAt: new Date().toISOString(), status: 'confirmed',
    })
    if (this.simulate === 'timeout_on_book') {
      // La réservation est faite côté fournisseur, mais la réponse n'arrive pas : statut à vérifier
      throw new ProviderTimeoutError(this.code, 'Tunisiabeds : délai dépassé lors de la confirmation')
    }
    return { status: 'confirmed', externalRef, amount: req.expectedAmount, currency: 'TND', conditions: 'Voucher disponible sous 24 h' }
  }

  async getBookingStatus(requestId: string): Promise<BookingResult> {
    await this.guard()
    const b = providerState(this.code).bookings.get(requestId)
    if (!b) return { status: 'unknown', externalRef: null, amount: null, currency: null, conditions: null, message: 'Aucune réservation pour cette demande' }
    return { status: b.status === 'cancelled' ? 'failed' : b.status, externalRef: b.externalRef, amount: b.amount, currency: b.currency, conditions: null }
  }
}
