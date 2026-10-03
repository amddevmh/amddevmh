/**
 * Fournisseur B — « MyGo » (simulé).
 * Format différent : results → Offres, libellés de pension libres, taxe de séjour en sus,
 * pas de clé d'idempotence : on retrouve une réservation par notre référence agence.
 */
import { nightsBetween } from '@hi/core'
import { providerState, seeded, sleep } from './mock-store'
import {
  ProviderTimeoutError, ProviderUnavailableError,
  type BookingRequest, type BookingResult, type HotelProvider, type HotelSearchParams,
  type NormalizedHotelOffer, type RecheckResult, type SimulationMode,
} from './types'

interface MgOffre { OffreId: string; Chambre: string; Pension: string; PrixTTC: string; Devise: string; TaxeSejourParNuit: string; Annulation: string; Stock: number }
interface MgResult { HotelId: number; HotelName: string; Ville: string; Etoiles: string; Offres: MgOffre[] }

const CATALOGUE = [
  { id: 7781, name: 'MARINA PALACE HAMMAMET', city: 'Hammamet', stars: '4*', base: 82 },
  { id: 5520, name: 'CONCORDE GREEN PARK', city: 'Port El Kantaoui', stars: '5*', base: 170 },
  { id: 7790, name: 'PARADIS PALACE', city: 'Hammamet', stars: '4*', base: 80 },
  { id: 6101, name: 'ROYAL THALASSA MONASTIR', city: 'Monastir', stars: '5*', base: 120 },
]

const PENSIONS: Array<{ label: string; board: NormalizedHotelOffer['board']; factor: number }> = [
  { label: 'Demi pension', board: 'DP', factor: 1.2 },
  { label: 'All Inclusive soft', board: 'ALL', factor: 1.55 },
]

function code(id: number) {
  return `MG-${id}`
}

function rawSearch(p: HotelSearchParams, priceBump = 0): { results: MgResult[] } {
  const nights = nightsBetween(p.checkIn, p.checkOut)
  const pax = p.adults + (p.children ?? 0) * 0.5
  return {
    results: CATALOGUE
      .filter((h) => (p.hotelCodes?.length ? p.hotelCodes.includes(code(h.id)) : !p.city || h.city.toLowerCase() === p.city.toLowerCase()))
      .map((h) => ({
        HotelId: h.id, HotelName: h.name, Ville: h.city, Etoiles: h.stars,
        Offres: PENSIONS.map((pen) => {
          const variation = 0.9 + seeded('mg', h.id, pen.board, p.checkIn) * 0.2
          // Montants transmis en chaînes avec virgule décimale (format fournisseur)
          const prix = Math.round((h.base * pen.factor * variation * nights * pax + priceBump) * 1000) / 1000
          return {
            OffreId: `${h.id}-${pen.board}-${p.checkIn}-${p.checkOut}`,
            Chambre: 'Double vue jardin',
            Pension: pen.label,
            PrixTTC: prix.toFixed(3).replace('.', ','),
            Devise: 'DT',
            TaxeSejourParNuit: '3,000',
            Annulation: pen.board === 'ALL' ? 'Non remboursable' : 'Gratuite jusqu’à J-7',
            Stock: Math.floor(seeded('mg', h.id, pen.board, p.checkIn, 'stock') * 5),
          }
        }),
      })),
  }
}

function normalize(raw: { results: MgResult[] }, p: HotelSearchParams): NormalizedHotelOffer[] {
  const fetchedAt = new Date().toISOString()
  const nights = nightsBetween(p.checkIn, p.checkOut)
  return raw.results.flatMap((h) =>
    h.Offres.map((o) => {
      const pen = PENSIONS.find((x) => x.label === o.Pension)
      return {
        provider: MYGO_CODE,
        providerHotelCode: code(h.HotelId),
        providerHotelName: h.HotelName,
        city: h.Ville,
        roomCode: 'DBL-JARDIN',
        roomType: o.Chambre,
        board: pen?.board ?? 'RO',
        boardLabelOriginal: o.Pension,
        occupancy: { adults: p.adults, children: p.children ?? 0 },
        checkIn: p.checkIn,
        checkOut: p.checkOut,
        nights,
        price: {
          amount: Number(o.PrixTTC.replace(',', '.')),
          currency: o.Devise === 'DT' ? 'TND' : o.Devise,
          taxesIncluded: false,      // taxe de séjour payable en sus : différence visible (REC24)
          touristTax: Number(o.TaxeSejourParNuit.replace(',', '.')) * nights * p.adults,
        },
        available: o.Stock > 0,
        remaining: o.Stock,
        refundable: o.Annulation !== 'Non remboursable',
        cancellationPolicy: o.Annulation,
        offerRef: o.OffreId,
        original: o,
        fetchedAt,
      }
    }),
  )
}

export const MYGO_CODE = 'hotel_api_mygo'

export class MyGoProvider implements HotelProvider {
  readonly code = MYGO_CODE
  readonly label = 'MyGo (simulé)'
  readonly capabilities = { search: true, book: true, confirm: false, voucher: false, modify: false, cancel: false, idempotencyKey: false }

  constructor(private options: { latencyMs?: number; simulate?: SimulationMode } = {}) {}

  private get simulate(): SimulationMode {
    return this.options.simulate ?? providerState(this.code).simulate
  }

  private async guard() {
    const latency = this.options.latencyMs ?? 180
    if (this.simulate === 'down') throw new ProviderUnavailableError(this.code, 'MyGo : erreur de connexion')
    await sleep(this.simulate === 'slow' ? latency * 10 : latency)
  }

  async search(p: HotelSearchParams) {
    await this.guard()
    return normalize(rawSearch(p), p)
  }

  async recheck(offerRef: string, p: HotelSearchParams): Promise<RecheckResult> {
    await this.guard()
    const bump = this.simulate === 'price_change' ? 42 : 0
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
    // Pas d'idempotence native : chaque appel crée une réservation (d'où le contrôle préalable côté connecteur)
    const externalRef = `MG-${Math.floor(seeded(req.requestId, s.bookCalls) * 1_000_000)}`
    s.bookings.set(`${req.requestId}#${s.bookCalls}`, {
      requestId: req.requestId, externalRef, amount: req.expectedAmount, currency: 'TND', createdAt: new Date().toISOString(), status: 'pending',
    })
    if (this.simulate === 'timeout_on_book') throw new ProviderTimeoutError(this.code, 'MyGo : délai dépassé')
    return { status: 'pending', externalRef, amount: req.expectedAmount, currency: 'TND', conditions: 'Confirmation manuelle du fournisseur requise' }
  }

  /** Recherche par référence agence. */
  async getBookingStatus(requestId: string): Promise<BookingResult> {
    await this.guard()
    const found = [...providerState(this.code).bookings.values()].filter((b) => b.requestId === requestId)
    if (found.length === 0) return { status: 'unknown', externalRef: null, amount: null, currency: null, conditions: null, message: 'Aucune réservation trouvée' }
    const b = found[0]!
    return {
      status: b.status === 'cancelled' ? 'failed' : b.status,
      externalRef: b.externalRef, amount: b.amount, currency: b.currency, conditions: null,
      message: found.length > 1 ? `${found.length} réservations pour la même demande : doublon à traiter` : undefined,
    }
  }
}
