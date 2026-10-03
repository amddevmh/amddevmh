/**
 * Contrat commun des connecteurs hôtels (API01–API04).
 * Chaque fournisseur a son propre format ; le connecteur normalise sans perdre
 * la valeur et la référence d'origine ni la date de consultation.
 */

export interface HotelSearchParams {
  city?: string
  hotelCodes?: string[]          // codes fournisseur (table hotel_mappings)
  checkIn: string                // YYYY-MM-DD
  checkOut: string
  adults: number
  children?: number
  childrenAges?: number[]
  rooms?: number
}

export interface ProviderCapabilities {
  search: boolean
  book: boolean
  confirm: boolean
  voucher: boolean
  modify: boolean
  cancel: boolean
  idempotencyKey: boolean
}

export interface NormalizedHotelOffer {
  provider: string
  providerHotelCode: string
  providerHotelName: string
  city: string
  roomCode: string
  roomType: string
  board: 'RO' | 'LPD' | 'DP' | 'PC' | 'ALL'
  boardLabelOriginal: string
  occupancy: { adults: number; children: number }
  checkIn: string
  checkOut: string
  nights: number
  price: { amount: number; currency: string; taxesIncluded: boolean; touristTax: number | null }
  available: boolean
  remaining: number | null
  refundable: boolean
  cancellationPolicy: string
  offerRef: string               // référence d'origine du fournisseur
  original: unknown              // réponse brute (masquée des données sensibles)
  fetchedAt: string
}

export interface BookingRequest {
  requestId: string              // identifiant unique de demande (idempotence)
  offerRef: string
  providerHotelCode: string
  checkIn: string
  checkOut: string
  guests: Array<{ firstName: string; lastName: string; type: 'adult' | 'child' }>
  expectedAmount: number
}

export type BookingStatus = 'confirmed' | 'pending' | 'failed' | 'unknown'

export interface BookingResult {
  status: BookingStatus
  externalRef: string | null
  amount: number | null
  currency: string | null
  conditions: string | null
  message?: string
}

export interface RecheckResult {
  available: boolean
  price: number | null
  currency: string | null
  changed: boolean
  offer: NormalizedHotelOffer | null
}

/** Scénarios de simulation pilotables depuis Paramètres → Connecteurs (config.simulate). */
export type SimulationMode = 'ok' | 'down' | 'slow' | 'timeout_on_book' | 'price_change'

export class ProviderUnavailableError extends Error {
  constructor(public provider: string, message = 'Fournisseur indisponible') {
    super(message)
    this.name = 'ProviderUnavailableError'
  }
}

export class ProviderTimeoutError extends Error {
  constructor(public provider: string, message = 'Délai dépassé') {
    super(message)
    this.name = 'ProviderTimeoutError'
  }
}

export interface HotelProvider {
  readonly code: string
  readonly label: string
  readonly capabilities: ProviderCapabilities
  search(params: HotelSearchParams): Promise<NormalizedHotelOffer[]>
  recheck(offerRef: string, params: HotelSearchParams): Promise<RecheckResult>
  book(req: BookingRequest): Promise<BookingResult>
  /** Contrôle du statut avant toute nouvelle tentative (API03). */
  getBookingStatus(requestId: string): Promise<BookingResult>
}
