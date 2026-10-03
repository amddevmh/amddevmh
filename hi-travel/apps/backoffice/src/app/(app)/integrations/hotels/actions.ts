'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@hi/db/server'
import type { Json } from '@hi/db'
import { bookSafely, searchProviders, type NormalizedHotelOffer, type ProviderSearchOutcome } from '@hi/integrations/hotels'
import { requireStaff } from '@/lib/auth'
import { fromDbError, type ActionState } from '@/lib/actions'
import { CONNECTOR_SUPPLIER_NAME, isSimulation, loadHotelConnectors, logApiCall, providerFor, type ConnectorRow } from '@/lib/admin/hotels'

// ---------------------------------------------------------------------------
// Connecteurs : activation indépendante, mode, scénario de simulation
// ---------------------------------------------------------------------------
export async function updateConnector(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('integrations', 'update')
  const code = String(formData.get('code') ?? '')
  const enabled = formData.get('enabled') === '1'
  const mode = String(formData.get('mode') ?? 'mock')
  const simulate = String(formData.get('simulate') ?? 'ok')
  if (!['mock', 'test', 'live'].includes(mode)) return { ok: false, error: 'Mode inconnu' }
  if (!isSimulation(simulate)) return { ok: false, error: 'Scénario de simulation inconnu' }
  const supabase = await createClient()
  const { data: cur } = await supabase.from('integration_connectors').select('config').eq('code', code).maybeSingle()
  if (!cur) return { ok: false, error: 'Connecteur introuvable' }
  const config = { ...((cur.config ?? {}) as Record<string, unknown>), simulate }
  const { error } = await supabase.from('integration_connectors').update({ enabled, mode, config: config as NonNullable<Json>, updated_at: new Date().toISOString() }).eq('code', code)
  if (error) return fromDbError(error)
  revalidatePath('/integrations/hotels')
  return { ok: true, message: `Connecteur ${code} mis à jour (${enabled ? 'activé' : 'désactivé'}, simulation « ${simulate} »).` }
}

// ---------------------------------------------------------------------------
// Recherche commune : fournisseurs interrogés en parallèle, offres jamais fusionnées
// ---------------------------------------------------------------------------
const searchSchema = z.object({
  city: z.string().optional(),
  hotelId: z.string().optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’arrivée requise'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de départ requise'),
  adults: z.number().int().min(1).max(12),
  children: z.number().int().min(0).max(8).default(0),
}).refine((v) => v.checkOut > v.checkIn, { message: 'La date de départ doit suivre la date d’arrivée' })
  .refine((v) => v.city || v.hotelId, { message: 'Choisissez une ville ou un hôtel' })

export type SearchInput = z.input<typeof searchSchema>

export interface ProviderResult {
  code: string
  label: string
  status: ProviderSearchOutcome['status'] | 'disabled' | 'not_mapped'
  message?: string
  offers: NormalizedHotelOffer[]
  durationMs?: number
  capabilities: Record<string, boolean>
}

export async function searchHotels(input: SearchInput): Promise<{ error?: string; results?: ProviderResult[]; searchedAt?: string }> {
  const session = await requireStaff('integrations', 'read')
  const parsed = searchSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' }
  const p = parsed.data
  const supabase = await createClient()
  const connectors = await loadHotelConnectors(supabase)
  const mappings = p.hotelId
    ? (await supabase.from('hotel_mappings').select('provider, provider_hotel_code').eq('hotel_id', p.hotelId).eq('status', 'validated')).data ?? []
    : []

  const results: ProviderResult[] = []
  const active: ConnectorRow[] = []
  for (const c of connectors) {
    if (!c.enabled || !c.capabilities?.search) {
      results.push({ code: c.code, label: c.label, status: 'disabled', message: 'Connecteur désactivé : parcours manuel', offers: [], capabilities: c.capabilities })
    } else if (p.hotelId && !mappings.some((m) => m.provider === c.code)) {
      results.push({ code: c.code, label: c.label, status: 'not_mapped', message: 'Hôtel non référencé chez ce fournisseur (table de correspondance)', offers: [], capabilities: c.capabilities })
    } else active.push(c)
  }
  const params = (code: string) => ({
    city: p.hotelId ? undefined : p.city,
    hotelCodes: p.hotelId ? mappings.filter((m) => m.provider === code).map((m) => m.provider_hotel_code) : undefined,
    checkIn: p.checkIn, checkOut: p.checkOut, adults: p.adults, children: p.children,
  })
  const outcomes = await searchProviders(active.map(providerFor), (prov) => params(prov.code))
  await Promise.all(outcomes.map((o) => logApiCall({
    connector: o.provider, operation: 'search', status: o.status, durationMs: o.durationMs, actorId: session.userId,
    request: params(o.provider), response: { offers: o.offers.length }, error: o.error,
  })))
  for (const o of outcomes) {
    const c = active.find((x) => x.code === o.provider)!
    results.push({
      code: c.code, label: c.label, status: o.status, offers: o.offers, durationMs: o.durationMs, capabilities: c.capabilities,
      message: o.status === 'timeout' ? 'Délai dépassé : fournisseur sans réponse' : o.status === 'unavailable' ? `Indisponible : ${o.error ?? ''}` : o.error,
    })
  }
  results.sort((a, b) => a.code.localeCompare(b.code))
  return { results, searchedAt: new Date().toISOString() }
}

/** Revérification du prix et de la disponibilité avant confirmation (API02). */
export async function recheckOffer(code: string, offerRef: string, input: SearchInput): Promise<{ error?: string; available?: boolean; price?: number | null; changed?: boolean; offer?: NormalizedHotelOffer | null }> {
  const session = await requireStaff('integrations', 'read')
  const parsed = searchSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }
  const supabase = await createClient()
  const c = (await loadHotelConnectors(supabase)).find((x) => x.code === code)
  if (!c || !c.enabled) return { error: 'Connecteur désactivé : contrôle manuel du prix requis' }
  const prov = providerFor(c)
  const { data: mappings } = parsed.data.hotelId
    ? await supabase.from('hotel_mappings').select('provider_hotel_code').eq('hotel_id', parsed.data.hotelId).eq('provider', code).eq('status', 'validated')
    : { data: null }
  const params = {
    city: parsed.data.hotelId ? undefined : parsed.data.city,
    hotelCodes: mappings?.map((m) => m.provider_hotel_code),
    checkIn: parsed.data.checkIn, checkOut: parsed.data.checkOut, adults: parsed.data.adults, children: parsed.data.children,
  }
  const start = Date.now()
  try {
    const r = await prov.recheck(offerRef, params)
    await logApiCall({ connector: code, operation: 'recheck', status: 'success', durationMs: Date.now() - start, actorId: session.userId, request: { offerRef, ...params }, response: { available: r.available, price: r.price, changed: r.changed } })
    return { available: r.available, price: r.price, changed: r.changed, offer: r.offer }
  } catch (e) {
    const status = (e as Error).name === 'ProviderTimeoutError' ? 'timeout' : (e as Error).name === 'ProviderUnavailableError' ? 'unavailable' : 'error'
    await logApiCall({ connector: code, operation: 'recheck', status, durationMs: Date.now() - start, actorId: session.userId, request: { offerRef, ...params }, error: (e as Error).message })
    return { error: `Revérification impossible (${(e as Error).message}) : contrôle manuel requis` }
  }
}

// ---------------------------------------------------------------------------
// Réservation idempotente (API03, REC25)
// ---------------------------------------------------------------------------
const bookSchema = z.object({
  serviceId: z.guid(),
  connector: z.string(),
  requestId: z.guid(),
  offer: z.custom<NormalizedHotelOffer>((v) => !!v && typeof v === 'object' && 'offerRef' in (v as object)),
  acceptedPrice: z.number().positive(),
  priceChanged: z.boolean(),
  priceChangeAccepted: z.boolean(),
})

export interface BookingOutcome { ok: boolean; status?: string; message: string; requestRowId?: string }

async function applyToService(supabase: Awaited<ReturnType<typeof createClient>>, serviceId: string, c: ConnectorRow, result: { status: string; externalRef: string | null; amount: number | null; conditions: string | null }, policy?: string) {
  const confirmed = result.status === 'confirmed' && !!c.capabilities?.confirm
  const { data: supplier } = await supabase.from('suppliers').select('id').ilike('name', CONNECTOR_SUPPLIER_NAME[c.code] ?? '__none__').maybeSingle()
  return supabase.from('services').update({
    external_provider: c.code,
    external_ref: result.externalRef,
    status: confirmed ? 'confirmed' : 'option',
    cost_confirmed: result.amount,
    confirmation_ref: confirmed ? result.externalRef : null,
    confirmed_at: confirmed ? new Date().toISOString() : null,
    cancellation_terms: policy ?? result.conditions ?? undefined,
    ...(supplier ? { supplier_id: supplier.id } : {}),
  }).eq('id', serviceId)
}

export async function bookHotel(input: z.input<typeof bookSchema>): Promise<BookingOutcome> {
  const session = await requireStaff('dossiers', 'update')
  if (!session.can('integrations', 'read')) return { ok: false, message: 'Accès refusé : connexions API' }
  const parsed = bookSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Demande invalide' }
  const v = parsed.data
  if (v.priceChanged && !v.priceChangeAccepted) return { ok: false, message: 'Le prix a changé : nouvelle acceptation explicite requise' }

  const supabase = await createClient()
  const c = (await loadHotelConnectors(supabase)).find((x) => x.code === v.connector)
  if (!c || !c.enabled) return { ok: false, message: 'Connecteur désactivé : utilisez le parcours manuel' }
  if (!c.capabilities?.book) return { ok: false, message: 'Réservation non disponible par API chez ce fournisseur : parcours manuel' }

  // Double soumission : même identifiant de demande → aucune seconde réservation
  const { data: same } = await supabase.from('hotel_booking_requests').select('id, status').eq('request_id', v.requestId).maybeSingle()
  if (same) return { ok: true, status: same.status, requestRowId: same.id, message: `Demande déjà envoyée (statut : ${same.status}). Aucune nouvelle réservation lancée.` }
  const { data: active } = await supabase.from('hotel_booking_requests').select('id, status').eq('service_id', v.serviceId).in('status', ['sent', 'pending', 'confirmed', 'to_verify']).limit(1).maybeSingle()
  if (active) return { ok: false, requestRowId: active.id, status: active.status, message: `Une demande existe déjà pour cette prestation (statut : ${active.status}). Vérifiez son statut avant toute nouvelle tentative.` }

  const { data: service } = await supabase.from('services').select('id, dossier_id').eq('id', v.serviceId).maybeSingle()
  if (!service) return { ok: false, message: 'Prestation introuvable' }
  const { data: travellers } = await supabase.from('dossier_travellers').select('travellers(first_name, last_name, pax_type)').eq('dossier_id', service.dossier_id)
  const guests = (travellers ?? []).map((t) => ({ firstName: t.travellers?.first_name ?? '', lastName: t.travellers?.last_name ?? '', type: (t.travellers?.pax_type === 'adult' ? 'adult' : 'child') as 'adult' | 'child' }))

  const { data: row, error } = await supabase.from('hotel_booking_requests').insert({
    request_id: v.requestId, connector_code: c.code, service_id: v.serviceId, dossier_id: service.dossier_id,
    provider_hotel_code: v.offer.providerHotelCode, offer_snapshot: v.offer as unknown as NonNullable<Json>, status: 'sent',
    amount: v.acceptedPrice, currency: v.offer.price.currency, conditions: v.offer.cancellationPolicy, attempts: 1,
  }).select('id').single()
  if (error || !row) return { ok: false, message: fromDbError(error).error ?? 'Enregistrement de la demande impossible' }

  const req = {
    requestId: v.requestId, offerRef: v.offer.offerRef, providerHotelCode: v.offer.providerHotelCode,
    checkIn: v.offer.checkIn, checkOut: v.offer.checkOut, guests, expectedAmount: v.acceptedPrice,
  }
  const start = Date.now()
  const outcome = await bookSafely(providerFor(c), req, false)
  await logApiCall({
    connector: c.code, operation: 'book', requestId: v.requestId, durationMs: Date.now() - start, actorId: session.userId, request: req,
    status: outcome.kind === 'booked' ? 'success' : outcome.kind === 'to_verify' ? 'timeout' : 'error',
    response: outcome.kind === 'booked' ? outcome.result : { kind: outcome.kind }, error: outcome.kind !== 'booked' ? outcome.reason : undefined,
  })

  if (outcome.kind === 'booked') {
    const st = outcome.result.status === 'confirmed' ? 'confirmed' : 'pending'
    await supabase.from('hotel_booking_requests').update({ status: st, external_ref: outcome.result.externalRef, amount: outcome.result.amount ?? v.acceptedPrice, conditions: outcome.result.conditions ?? v.offer.cancellationPolicy }).eq('id', row.id)
    const { error: sErr } = await applyToService(supabase, v.serviceId, c, outcome.result, v.offer.cancellationPolicy)
    revalidatePath('/integrations/hotels')
    return {
      ok: true, status: st, requestRowId: row.id,
      message: st === 'confirmed' && c.capabilities?.confirm
        ? `Réservation confirmée par ${c.label} — référence ${outcome.result.externalRef}.${sErr ? ` Mise à jour de la prestation à reprendre : ${sErr.message}` : ''}`
        : `Demande enregistrée chez ${c.label} (référence ${outcome.result.externalRef}) : en attente de confirmation du fournisseur ; prestation en option.`,
    }
  }
  if (outcome.kind === 'to_verify') {
    await supabase.from('hotel_booking_requests').update({ status: 'to_verify', last_error: outcome.reason }).eq('id', row.id)
    await supabase.rpc('flag_hotel_booking_to_verify', { p_booking_request_id: row.id, p_reason: outcome.reason })
    revalidatePath('/integrations/hotels')
    return { ok: false, status: 'to_verify', requestRowId: row.id, message: `Statut à vérifier : ${outcome.reason}. Une alerte a été créée ; aucune nouvelle réservation ne sera lancée sans contrôle.` }
  }
  await supabase.from('hotel_booking_requests').update({ status: 'failed', last_error: outcome.reason }).eq('id', row.id)
  revalidatePath('/integrations/hotels')
  return { ok: false, status: 'failed', requestRowId: row.id, message: `Échec de la réservation : ${outcome.reason}` }
}

/** Contrôle du statut d'une demande incertaine : jamais de nouvel envoi à l'aveugle. */
export async function verifyBooking(bookingRowId: string): Promise<BookingOutcome & { canRetry?: boolean }> {
  const session = await requireStaff('dossiers', 'update')
  const supabase = await createClient()
  const { data: row } = await supabase.from('hotel_booking_requests').select('*').eq('id', bookingRowId).maybeSingle()
  if (!row) return { ok: false, message: 'Demande introuvable' }
  const c = (await loadHotelConnectors(supabase)).find((x) => x.code === row.connector_code)
  if (!c) return { ok: false, message: 'Connecteur introuvable' }
  if (!c.enabled) return { ok: false, message: 'Connecteur désactivé : vérification manuelle auprès du fournisseur' }
  const start = Date.now()
  let status
  try {
    status = await providerFor(c).getBookingStatus(row.request_id)
  } catch (e) {
    await logApiCall({ connector: c.code, operation: 'booking_status', requestId: row.request_id, status: 'unavailable', durationMs: Date.now() - start, actorId: session.userId, error: (e as Error).message })
    return { ok: false, status: row.status, message: `Fournisseur injoignable (${(e as Error).message}) : nouvelle vérification plus tard ou contrôle manuel` }
  }
  await logApiCall({ connector: c.code, operation: 'booking_status', requestId: row.request_id, status: 'success', durationMs: Date.now() - start, actorId: session.userId, response: status })
  if (status.status === 'confirmed' || status.status === 'pending') {
    await supabase.from('hotel_booking_requests').update({ status: status.status, external_ref: status.externalRef, last_error: status.message ?? null }).eq('id', row.id)
    const snap = row.offer_snapshot as unknown as NormalizedHotelOffer
    if (row.service_id) await applyToService(supabase, row.service_id, c, { ...status, amount: status.amount ?? Number(row.amount) }, snap?.cancellationPolicy)
    await supabase.from('alerts').update({ status: 'resolved', resolution_note: `Statut vérifié : ${status.status} (${status.externalRef})` }).eq('dedupe_key', `hotel-booking:${row.request_id}`)
    revalidatePath('/integrations/hotels')
    return { ok: true, status: status.status, requestRowId: row.id, message: `Réservation trouvée chez le fournisseur : ${status.status === 'confirmed' ? 'confirmée' : 'en attente'} — référence ${status.externalRef}.${status.message ? ` ${status.message}` : ''}` }
  }
  if (status.status === 'failed') {
    await supabase.from('hotel_booking_requests').update({ status: 'failed', last_error: status.message ?? 'Refusée' }).eq('id', row.id)
    revalidatePath('/integrations/hotels')
    return { ok: false, status: 'failed', requestRowId: row.id, message: 'Réservation refusée ou annulée chez le fournisseur.' }
  }
  return {
    ok: false, status: row.status, requestRowId: row.id, canRetry: !!c.capabilities?.idempotency_key,
    message: c.capabilities?.idempotency_key
      ? 'Aucune réservation trouvée pour cette demande. Une nouvelle tentative avec le même identifiant est possible (idempotence native du fournisseur).'
      : 'Aucune réservation trouvée, mais ce fournisseur n’a pas d’idempotence : contrôle manuel auprès du fournisseur avant toute nouvelle demande.',
  }
}

/** Nouvelle tentative contrôlée : même identifiant de demande, statut interrogé d'abord (bookSafely). */
export async function retryBooking(bookingRowId: string): Promise<BookingOutcome> {
  const session = await requireStaff('dossiers', 'update')
  const supabase = await createClient()
  const { data: row } = await supabase.from('hotel_booking_requests').select('*').eq('id', bookingRowId).maybeSingle()
  if (!row || row.status !== 'to_verify') return { ok: false, message: 'Seule une demande « à vérifier » peut être reprise' }
  const c = (await loadHotelConnectors(supabase)).find((x) => x.code === row.connector_code)
  if (!c || !c.enabled) return { ok: false, message: 'Connecteur désactivé : parcours manuel' }
  const snap = row.offer_snapshot as unknown as NormalizedHotelOffer
  const req = { requestId: row.request_id, offerRef: snap.offerRef, providerHotelCode: row.provider_hotel_code, checkIn: snap.checkIn, checkOut: snap.checkOut, guests: [], expectedAmount: Number(row.amount) }
  const start = Date.now()
  const outcome = await bookSafely(providerFor(c), req, true)
  await logApiCall({ connector: c.code, operation: 'book_retry', requestId: row.request_id, durationMs: Date.now() - start, actorId: session.userId, request: req, status: outcome.kind === 'booked' ? 'success' : outcome.kind === 'to_verify' ? 'timeout' : 'error', error: outcome.kind !== 'booked' ? outcome.reason : undefined })
  await supabase.from('hotel_booking_requests').update({ attempts: row.attempts + outcome.attempts }).eq('id', row.id)
  if (outcome.kind === 'booked') {
    const st = outcome.result.status === 'confirmed' ? 'confirmed' : 'pending'
    await supabase.from('hotel_booking_requests').update({ status: st, external_ref: outcome.result.externalRef }).eq('id', row.id)
    if (row.service_id) await applyToService(supabase, row.service_id, c, outcome.result, snap.cancellationPolicy)
    await supabase.from('alerts').update({ status: 'resolved', resolution_note: `Reprise contrôlée : ${st}` }).eq('dedupe_key', `hotel-booking:${row.request_id}`)
    revalidatePath('/integrations/hotels')
    return { ok: true, status: st, message: `Réservation ${st === 'confirmed' ? 'confirmée' : 'en attente'} — référence ${outcome.result.externalRef}` }
  }
  return { ok: false, status: outcome.kind === 'to_verify' ? 'to_verify' : 'failed', message: outcome.reason }
}

/** Parcours manuel : statut saisi après contrôle auprès du fournisseur. */
export async function closeBookingManually(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  const ref = String(formData.get('external_ref') ?? '').trim() || null
  if (!['confirmed', 'failed', 'cancelled'].includes(status)) return { ok: false, error: 'Statut invalide' }
  const supabase = await createClient()
  const { data: row, error } = await supabase.from('hotel_booking_requests').update({ status, external_ref: ref, last_error: 'Statut saisi manuellement après contrôle fournisseur' }).eq('id', id).select('request_id').single()
  if (error) return fromDbError(error)
  await supabase.from('alerts').update({ status: 'resolved', resolution_note: `Contrôle manuel : ${status}` }).eq('dedupe_key', `hotel-booking:${row.request_id}`)
  revalidatePath('/integrations/hotels')
  return { ok: true, message: 'Statut mis à jour manuellement' }
}

// ---------------------------------------------------------------------------
// Table de correspondance des hôtels (API02)
// ---------------------------------------------------------------------------
export async function proposeMapping(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('integrations', 'update')
  const hotel_id = String(formData.get('hotel_id') ?? '')
  const provider = String(formData.get('provider') ?? '')
  const code = String(formData.get('provider_hotel_code') ?? '').trim()
  const name = String(formData.get('provider_hotel_name') ?? '').trim() || null
  const validate = formData.get('validate') === '1'
  if (!hotel_id || !provider || !code) return { ok: false, error: 'Hôtel, fournisseur et code requis' }
  const supabase = await createClient()
  const { error } = await supabase.from('hotel_mappings').insert({
    hotel_id, provider, provider_hotel_code: code, provider_hotel_name: name, status: validate ? 'validated' : 'proposed', validated_by: validate ? session.userId : null,
  })
  if (error) return fromDbError(error)
  revalidatePath('/integrations/hotels')
  return { ok: true, message: validate ? 'Correspondance validée' : 'Correspondance proposée : à valider' }
}

export async function reviewMapping(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('integrations', 'update')
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!['validated', 'rejected'].includes(status)) return { ok: false, error: 'Décision invalide' }
  const supabase = await createClient()
  const { error } = await supabase.from('hotel_mappings').update({ status, validated_by: session.userId }).eq('id', id)
  if (error) return fromDbError(error)
  revalidatePath('/integrations/hotels')
  return { ok: true, message: status === 'validated' ? 'Correspondance validée' : 'Correspondance rejetée' }
}
