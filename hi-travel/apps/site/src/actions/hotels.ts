'use server'

import type { Json } from '@hi/db'
import { z } from 'zod'
import { createPublicClient } from '@/lib/supabase'
import { recheckInputSchema, recheckOffer, type PublicHotelOffer, type RecheckInput } from '@/lib/hotels'
import { formDataToRequestInput, requestSchema, toSubmitPayload, zodFieldErrors } from '@/lib/requests'
import { t } from '@/lib/i18n'

export type RecheckResponse =
  | { status: 'available'; offer: PublicHotelOffer }
  | { status: 'unavailable' | 'error' }
  | { status: 'invalid' }

/** « Demander cette offre » : revérification serveur du prix et de la disponibilité. */
export async function recheckHotelOffer(input: RecheckInput): Promise<RecheckResponse> {
  const parsed = recheckInputSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid' }
  const res = await recheckOffer(parsed.data)
  if (res.status === 'available') return { status: 'available', offer: res.offer }
  return { status: res.status }
}

export interface HotelRequestState {
  status: 'idle' | 'error' | 'success' | 'price_changed'
  error?: string
  fieldErrors?: Record<string, string>
  reference?: string
  duplicate?: boolean
  newPrice?: number
  onRequest?: boolean
}

const hotelFields = z.object({
  provider: z.string(),
  offer_ref: z.string().min(3).max(200),
  accepted_price: z.union([z.coerce.number().positive(), z.literal('')]).optional(),
  hotel_name: z.string().max(160),
  room_type: z.string().max(160).optional(),
})

/**
 * Création de la demande CRM pour une offre hôtel (activité hotel_tn).
 * Le prix est revérifié côté serveur : s'il diffère du prix accepté, une nouvelle acceptation est demandée.
 * Fournisseur indisponible ou offre épuisée → demande « sur demande », traitée manuellement.
 */
export async function requestHotelOffer(_prev: HotelRequestState, formData: FormData): Promise<HotelRequestState> {
  const raw = formDataToRequestInput(formData)
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return { status: 'success' }

  const h = hotelFields.safeParse(raw)
  const recheckIn = recheckInputSchema.safeParse({
    provider: raw.provider, offerRef: raw.offer_ref, city: raw.city, checkIn: raw.date_from, checkOut: raw.date_to,
    adults: raw.adults, children: raw.children ?? 0, rooms: raw.rooms ?? 1,
  })
  const parsed = requestSchema.safeParse({ ...raw, activity: 'hotel_tn' })
  if (!h.success || !recheckIn.success) return { status: 'error', error: t.form.errors.generic }
  if (!parsed.success) return { status: 'error', error: t.form.errors.generic, fieldErrors: zodFieldErrors(parsed.error) }

  const accepted = h.data.accepted_price === '' || h.data.accepted_price == null ? null : Number(h.data.accepted_price)
  const check = await recheckOffer(recheckIn.data)

  let onRequest = false
  let reason: string | null = null
  let offer: PublicHotelOffer | null = null
  if (check.status === 'available') {
    offer = check.offer
    if (accepted == null || Math.abs(offer.salePrice - accepted) > 0.0005) {
      // Le prix a changé : aucune demande créée sans nouvelle acceptation explicite
      return { status: 'price_changed', newPrice: offer.salePrice, error: t.hotels.priceAgainChanged }
    }
  } else {
    onRequest = true
    reason = check.status === 'unavailable' ? 'offre_epuisee' : 'fournisseur_indisponible'
    offer = check.status === 'unavailable' ? check.offer : null
  }

  const payload = toSubmitPayload(parsed.data, {
    source: 'hotel_search',
    provider: recheckIn.data.provider,
    provider_hotel_code: offer?.providerHotelCode ?? raw.hotel_code ?? null,
    hotel_name: offer?.hotelName ?? h.data.hotel_name,
    offer_ref: recheckIn.data.offerRef,
    room_type: offer?.roomType ?? h.data.room_type ?? null,
    board: offer?.board ?? raw.board ?? null,
    board_label_original: offer?.boardLabelOriginal ?? null,
    check_in: recheckIn.data.checkIn,
    check_out: recheckIn.data.checkOut,
    nights: offer?.nights ?? null,
    rooms: recheckIn.data.rooms,
    quoted_price: onRequest ? accepted : offer!.salePrice,
    currency: offer?.currency ?? 'TND',
    price_basis: 'total_sejour',
    taxes_included: offer?.taxesIncluded ?? null,
    tourist_tax: offer?.touristTax ?? null,
    refundable: offer?.refundable ?? null,
    cancellation_policy: offer?.cancellationPolicy ?? null,
    fetched_at: offer?.fetchedAt ?? new Date().toISOString(),
    price_change_accepted: raw.price_changed === '1' ? { previous: Number(raw.previous_price) || null, accepted } : null,
    availability: onRequest ? 'sur_demande' : 'revérifiée_disponible',
    on_request_reason: reason,
  })
  // La destination enregistrée reprend l'hôtel et la ville
  payload.destination = [offer?.hotelName ?? h.data.hotel_name, recheckIn.data.city].filter(Boolean).join(', ')

  const { data, error } = await createPublicClient().rpc('submit_site_request', { p: payload as unknown as Json })
  if (error) {
    const known = error.code === 'P0001' && error.message.length < 200
    return { status: 'error', error: known ? error.message : t.form.errors.server }
  }
  const result = data as { reference: string; duplicate_submission: boolean }
  return { status: 'success', reference: result.reference, duplicate: result.duplicate_submission, onRequest }
}
