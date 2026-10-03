'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { parseCsv } from '@hi/core'
import type { Json, TablesInsert, TablesUpdate } from '@hi/db'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { zonedLocalToIso } from '@/lib/ops/format'
import { bool, fail, NOT_ALLOWED, ok, refreshAll } from '@/lib/ops/server'

const uuid = z.guid()
const optDate = z.iso.date('Date invalide').optional()
const money = z.coerce.number().min(0, 'Montant ≥ 0')

// ---------------------------------------------------------------------------
// Statut commercial et confirmation
// ---------------------------------------------------------------------------

export async function setDossierStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    dossier_id: uuid,
    status: z.enum(['request', 'quote_prepared', 'quote_sent', 'accepted', 'booking', 'confirmed', 'travelling', 'completed', 'archived', 'cancelled']),
    reason: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.status === 'cancelled' && !v.reason) {
    return { ok: false, error: 'Motif d’annulation obligatoire', fieldErrors: { reason: ['Motif obligatoire'] } }
  }
  const supabase = await db()
  const { error } = await supabase.rpc('set_dossier_status', { p_dossier_id: v.dossier_id, p_status: v.status, p_reason: v.reason })
  if (error) return fromDbError(error)
  return ok('Statut du dossier mis à jour')
}

/** Confirmation : prérequis vérifiés par confirm_dossier ; dérogation motivée réservée au droit « valider ». */
export async function confirmDossierAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({ dossier_id: uuid, derogation_reason: z.string().optional() }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { error } = await supabase.rpc('confirm_dossier', { p_dossier_id: parsed.data.dossier_id, p_derogation_reason: parsed.data.derogation_reason })
  if (error) return fromDbError(error)
  return ok(parsed.data.derogation_reason ? 'Dossier confirmé par dérogation (motif visible et historisé)' : 'Dossier confirmé')
}

export async function updateDossierInfo(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    id: uuid, title: z.string().min(3, 'Intitulé obligatoire'), destination: z.string().optional(), owner_id: z.string().optional(),
    start_date: optDate, end_date: optDate, notes: z.string().optional(),
    adults: z.coerce.number().int().min(0), children: z.coerce.number().int().min(0), infants: z.coerce.number().int().min(0),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.start_date && v.end_date && v.end_date < v.start_date) return fail('La date de retour précède la date de départ')
  const supabase = await db()
  const { data, error } = await supabase.from('dossiers').update({
    title: v.title, destination: v.destination ?? null, owner_id: v.owner_id || null, start_date: v.start_date ?? null, end_date: v.end_date ?? null,
    notes: v.notes ?? null, adults: v.adults, children: v.children, infants: v.infants,
  }).eq('id', v.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('Dossier mis à jour')
}

// ---------------------------------------------------------------------------
// Prestations
// ---------------------------------------------------------------------------

const DETAIL_KEYS = [
  'rooms', 'pickup', 'dropoff', 'vehicle', 'driver', 'driver_phone', 'pax_count', 'vehicle_capacity', 'item_kind', 'venue', 'capacity',
  'schedule_note', 'guide', 'country', 'city', 'notes', 'meeting_point', 'contact',
] as const

const serviceSchema = z.object({
  id: uuid.optional(),
  dossier_id: uuid,
  activity: z.enum(['hotel_tn', 'hotel_intl', 'tailor_made', 'organized_trip', 'visa', 'ticketing', 'circuit', 'transport', 'mice']),
  service_type: z.enum(['flight', 'hotel', 'transfer', 'excursion', 'visa', 'transport', 'circuit', 'package', 'event_item', 'insurance', 'fee', 'other']),
  description: z.string().min(2, 'Description obligatoire'),
  supplier_id: uuid.optional(),
  hotel_id: uuid.optional(),
  start_date: optDate,
  end_date: optDate,
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  local_timezone: z.string().default('Africa/Tunis'),
  pax_type: z.enum(['adult', 'child', 'infant', 'all']).default('all'),
  quantity: z.coerce.number().positive('Quantité > 0').default(1),
  room_type: z.string().optional(),
  board: z.string().optional(),
  occupancy: z.string().optional(),
  cost_planned: money.optional(),
  cost_confirmed: money.optional(),
  cost_currency: z.string().length(3).optional(),
  fx_rate: z.coerce.number().positive('Taux > 0').optional(),
  fx_rate_date: optDate,
  fx_rate_source: z.string().optional(),
  sale_price: money.default(0),
  cancellation_terms: z.string().optional(),
  external_ref: z.string().optional(),
  linked_service_id: uuid.optional(),
})

/** Création / modification d’une prestation, champs propres à chaque module. */
export async function saveService(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('dossiers', 'update')
  const parsed = serviceSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.start_date && v.end_date && v.end_date < v.start_date) {
    return { ok: false, error: v.service_type === 'hotel' ? 'La date de départ de l’hôtel précède la date d’arrivée' : 'La date de fin précède la date de début', fieldErrors: { end_date: ['Date incohérente'] } }
  }
  const startAt = zonedLocalToIso(v.start_at, v.local_timezone)
  const endAt = zonedLocalToIso(v.end_at, v.local_timezone)
  if (startAt && endAt && endAt < startAt) return fail('L’heure de fin précède l’heure de début')
  const supabase = await db()

  let details: Record<string, unknown> = {}
  if (v.id) {
    const { data: cur } = await supabase.from('services').select('details').eq('id', v.id).maybeSingle()
    details = { ...((cur?.details ?? {}) as Record<string, unknown>) }
  }
  for (const k of DETAIL_KEYS) {
    if (formData.has(k)) {
      const val = String(formData.get(k) ?? '').trim()
      if (val) details[k] = val
      else delete details[k]
    }
  }

  const row: TablesUpdate<'services'> = {
    activity: v.activity, service_type: v.service_type, description: v.description, supplier_id: v.supplier_id ?? null, hotel_id: v.hotel_id ?? null,
    start_date: v.start_date ?? (startAt ? startAt.slice(0, 10) : null), end_date: v.end_date ?? (endAt ? endAt.slice(0, 10) : null),
    start_at: startAt, end_at: endAt, local_timezone: v.local_timezone, pax_type: v.pax_type, quantity: v.quantity,
    room_type: v.room_type ?? null, board: v.board ?? null, occupancy: v.occupancy ?? null, sale_price: v.sale_price,
    cancellation_terms: v.cancellation_terms ?? null, external_ref: v.external_ref ?? null,
    linked_service_id: v.linked_service_id && v.linked_service_id !== v.id ? v.linked_service_id : null,
    is_mandatory: bool(formData.get('is_mandatory')),
    details: details as NonNullable<Json>,
  }
  // Coûts internes : uniquement avec le droit « marges »
  if (session.can('margins')) {
    Object.assign(row, {
      cost_planned: v.cost_planned ?? 0, cost_confirmed: v.cost_confirmed ?? null, cost_currency: v.cost_currency ?? 'TND',
      fx_rate: v.cost_currency === 'TND' || !v.cost_currency ? 1 : (v.fx_rate ?? 1), fx_rate_date: v.fx_rate_date ?? null, fx_rate_source: v.fx_rate_source ?? null,
    })
  }
  if (v.id) {
    const { data, error } = await supabase.from('services').update(row).eq('id', v.id).eq('dossier_id', v.dossier_id).select('id')
    if (error) return fromDbError(error)
    if (!data?.length) return fail(NOT_ALLOWED)
    return ok('Prestation enregistrée', v.id)
  }
  const { data, error } = await supabase.from('services').insert({ ...(row as TablesInsert<'services'>), dossier_id: v.dossier_id, status: 'requested' }).select('id').single()
  if (error) return fromDbError(error)
  refreshAll()
  redirect(`/dossiers/${v.dossier_id}/prestations/${data.id}`)
}

/**
 * Cycle de statut d’une prestation : demandée → option (date limite obligatoire) → confirmée
 * (référence fournisseur obligatoire, preuve recommandée) ; annulation motivée. Une option n’est jamais
 * affichée comme confirmée.
 */
export async function setServiceStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    id: uuid, dossier_id: uuid,
    status: z.enum(['requested', 'option', 'confirmed', 'cancelled']),
    option_deadline: z.string().optional(),
    option_source: z.string().optional(),
    confirmation_ref: z.string().optional(),
    confirmation_document_id: uuid.optional(),
    cost_confirmed: z.coerce.number().min(0).optional(),
    cancel_reason: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const patch: TablesUpdate<'services'> = { status: v.status }
  let deadlineIso: string | null = null
  if (v.status === 'option') {
    deadlineIso = zonedLocalToIso(v.option_deadline)
    if (!deadlineIso) return { ok: false, error: 'Date limite de l’option obligatoire (communiquée par le fournisseur)', fieldErrors: { option_deadline: ['Obligatoire'] } }
    if (!v.option_source) return { ok: false, error: 'Indiquer la source de la date d’option (e-mail fournisseur, API…)', fieldErrors: { option_source: ['Obligatoire'] } }
    patch.option_deadline = deadlineIso
  }
  if (v.status === 'confirmed') {
    if (!v.confirmation_ref) return { ok: false, error: 'Référence de confirmation fournisseur obligatoire', fieldErrors: { confirmation_ref: ['Obligatoire'] } }
    patch.confirmation_ref = v.confirmation_ref
    patch.confirmation_document_id = v.confirmation_document_id ?? null
    patch.confirmed_at = new Date().toISOString()
    if (v.cost_confirmed != null && formData.get('cost_confirmed') !== '') patch.cost_confirmed = v.cost_confirmed
  }
  if (v.status === 'cancelled') {
    if (!v.cancel_reason) return { ok: false, error: 'Motif d’annulation obligatoire', fieldErrors: { cancel_reason: ['Obligatoire'] } }
    const { data: cur } = await supabase.from('services').select('details').eq('id', v.id).maybeSingle()
    patch.details = { ...((cur?.details ?? {}) as Record<string, unknown>), cancel_reason: v.cancel_reason } as NonNullable<Json>
  }
  const { data, error } = await supabase.from('services').update(patch).eq('id', v.id).eq('dossier_id', v.dossier_id).select('id, description')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)

  if (v.status === 'option' && deadlineIso) {
    // DEL01 : l’expiration d’option est une échéance contractuelle externe, avec sa source
    const { data: existing } = await supabase.from('external_deadlines').select('id').eq('service_id', v.id).eq('kind', 'option_expiry').eq('status', 'open').maybeSingle()
    const dl = { due_at: deadlineIso, source: 'supplier' as const, source_note: v.option_source ?? null, received_at: new Date().toISOString(), needs_recheck: false }
    if (existing) await supabase.from('external_deadlines').update(dl).eq('id', existing.id)
    else await supabase.from('external_deadlines').insert({ ...dl, dossier_id: v.dossier_id, service_id: v.id, kind: 'option_expiry', label: `Expiration option : ${data[0]!.description}` })
  }
  if (v.status === 'confirmed' || v.status === 'cancelled') {
    await supabase.from('external_deadlines').update({ status: v.status === 'confirmed' ? 'met' : 'cancelled' }).eq('service_id', v.id).eq('kind', 'option_expiry').eq('status', 'open')
  }
  return ok(v.status === 'confirmed' ? 'Prestation confirmée' : v.status === 'option' ? 'Option enregistrée avec sa date limite' : v.status === 'cancelled' ? 'Prestation annulée' : 'Statut mis à jour')
}

/** Revue d’une prestation liée signalée après modification : acquittement explicite, sans modification automatique. */
export async function acknowledgeReview(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({ id: uuid, dossier_id: uuid, note: z.string().min(3, 'Indiquer le résultat de la vérification') }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { data, error } = await supabase.from('services').update({ needs_review: false, review_reason: null }).eq('id', parsed.data.id).select('id, description')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  await supabase.from('interactions').insert({ dossier_id: parsed.data.dossier_id, channel: 'note', summary: `Revue de « ${data[0]!.description} » effectuée : ${parsed.data.note}` })
  return ok('Revue enregistrée')
}

// --- Billetterie ----------------------------------------------------------------

export async function addFlightSegment(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    service_id: uuid, seq: z.coerce.number().int().min(1).default(1), carrier: z.string().min(2, 'Compagnie obligatoire'), flight_number: z.string().min(2, 'N° de vol obligatoire'),
    from_airport: z.string().length(3, 'Code IATA à 3 lettres'), to_airport: z.string().length(3, 'Code IATA à 3 lettres'),
    departs_local: z.string().min(1, 'Départ obligatoire'), departs_tz: z.string(), arrives_local: z.string().min(1, 'Arrivée obligatoire'), arrives_tz: z.string(),
    pnr: z.string().optional(), baggage: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const departs = zonedLocalToIso(v.departs_local, v.departs_tz)
  const arrives = zonedLocalToIso(v.arrives_local, v.arrives_tz)
  if (!departs || !arrives) return fail('Horaires invalides')
  if (arrives <= departs) return fail('L’arrivée (heure locale convertie) précède le départ : vérifier les fuseaux horaires')
  const supabase = await db()
  const { error } = await supabase.from('flight_segments').insert({
    service_id: v.service_id, seq: v.seq, carrier: v.carrier.toUpperCase(), flight_number: v.flight_number.toUpperCase(),
    from_airport: v.from_airport.toUpperCase(), to_airport: v.to_airport.toUpperCase(), departs_at: departs, departs_tz: v.departs_tz,
    arrives_at: arrives, arrives_tz: v.arrives_tz, pnr: v.pnr?.toUpperCase() ?? null, baggage: v.baggage ?? null,
  })
  if (error) return fromDbError(error)
  // Horaires de la prestation alignés sur le premier départ et la dernière arrivée
  const { data: segs } = await supabase.from('flight_segments').select('departs_at, arrives_at').eq('service_id', v.service_id).order('departs_at')
  if (segs?.length) {
    await supabase.from('services').update({ start_at: segs[0]!.departs_at, end_at: segs.at(-1)!.arrives_at }).eq('id', v.service_id)
  }
  return ok('Segment ajouté')
}

export async function deleteFlightSegment(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const id = uuid.safeParse(formData.get('id'))
  if (!id.success) return fail('Segment inconnu')
  const supabase = await db()
  const { data, error } = await supabase.from('flight_segments').delete().eq('id', id.data).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('Segment retiré')
}

export async function saveTicket(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    id: uuid.optional(), service_id: uuid, traveller_id: uuid.optional(), passenger_name: z.string().optional(), pnr: z.string().optional(),
    ticket_number: z.string().optional(), status: z.enum(['pending', 'issued', 'reissued', 'void', 'refund_expected', 'refunded']).default('pending'),
    issue_deadline: z.string().optional(), fare: money.default(0), taxes: money.default(0), service_fee: money.default(0), sale_price: money.default(0),
    penalty: money.default(0), refund_amount: money.optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (['issued', 'reissued'].includes(v.status) && !v.ticket_number) return { ok: false, error: 'Numéro de billet obligatoire pour un billet émis', fieldErrors: { ticket_number: ['Obligatoire'] } }
  const supabase = await db()
  const row = {
    service_id: v.service_id, traveller_id: v.traveller_id ?? null, passenger_name: v.passenger_name ?? null, pnr: v.pnr?.toUpperCase() ?? null,
    ticket_number: v.ticket_number ?? null, status: v.status, issue_deadline: zonedLocalToIso(v.issue_deadline),
    fare: v.fare, taxes: v.taxes, service_fee: v.service_fee, sale_price: v.sale_price, penalty: v.penalty, refund_amount: v.refund_amount ?? null,
    issued_at: ['issued', 'reissued'].includes(v.status) ? new Date().toISOString() : null,
  }
  const { error } = v.id
    ? await supabase.from('tickets').update(row).eq('id', v.id)
    : await supabase.from('tickets').insert(row)
  if (error) return fromDbError(error)
  return ok(v.id ? 'Billet mis à jour' : 'Billet ajouté')
}

// --- Visa -------------------------------------------------------------------------

export async function saveVisaApplication(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    id: uuid.optional(), service_id: uuid, traveller_id: uuid.optional(), destination: z.string().min(2, 'Destination obligatoire'),
    visa_type: z.string().default('tourism'), checklist_version: z.string().optional(), checklist_text: z.string().optional(),
    appointment_at: z.string().optional(), submitted_at: z.string().optional(),
    status: z.enum(['collecting', 'ready', 'appointment', 'submitted', 'decision_received', 'passport_returned', 'cancelled']).default('collecting'),
    decision: z.enum(['granted', 'refused', 'pending']).optional(), consular_fee: money.default(0), center_fee: money.default(0), agency_fee: money.default(0),
    passport_returned_at: z.string().optional(), expiry_date: optDate, notes: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.status === 'decision_received' && !v.decision) return { ok: false, error: 'Indiquer la décision consulaire reçue', fieldErrors: { decision: ['Obligatoire'] } }
  if (v.status === 'passport_returned' && !v.passport_returned_at) return { ok: false, error: 'Date de restitution du passeport obligatoire', fieldErrors: { passport_returned_at: ['Obligatoire'] } }
  const supabase = await db()
  // Checklist : une ligne par pièce ; les pièces cochées (received) sont reprises du formulaire
  const labels = (v.checklist_text ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
  const checklist = labels.map((label, i) => ({ code: `p${i + 1}`, label, received: formData.get(`received_${i}`) === 'on' }))
  const row = {
    service_id: v.service_id, traveller_id: v.traveller_id ?? null, destination: v.destination, visa_type: v.visa_type,
    checklist_version: v.checklist_version ?? null, checklist: checklist as NonNullable<Json>, appointment_at: zonedLocalToIso(v.appointment_at),
    submitted_at: zonedLocalToIso(v.submitted_at), status: v.status, decision: v.decision ?? null,
    consular_fee: v.consular_fee, center_fee: v.center_fee, agency_fee: v.agency_fee,
    passport_returned_at: zonedLocalToIso(v.passport_returned_at), expiry_date: v.expiry_date ?? null, notes: v.notes ?? null,
  }
  const { error } = v.id ? await supabase.from('visa_applications').update(row).eq('id', v.id) : await supabase.from('visa_applications').insert(row)
  if (error) return fromDbError(error)
  return ok(v.id ? 'Dossier visa mis à jour' : 'Dossier visa créé')
}

// ---------------------------------------------------------------------------
// Voyageurs du dossier
// ---------------------------------------------------------------------------

export async function attachTraveller(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({ dossier_id: uuid, traveller_id: z.guid('Choisir un voyageur'), room_label: z.string().optional(), special_requests: z.string().optional() }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { error } = await supabase.from('dossier_travellers').insert({ ...parsed.data, room_label: parsed.data.room_label ?? null, special_requests: parsed.data.special_requests ?? null, is_lead: bool(formData.get('is_lead')) })
  if (error) return fromDbError(error)
  return ok('Voyageur rattaché')
}

export async function updateDossierTraveller(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({ dossier_id: uuid, traveller_id: uuid, room_label: z.string().optional(), special_requests: z.string().optional() }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  if (formData.has('remove')) {
    const { error } = await supabase.from('dossier_travellers').delete().eq('dossier_id', v.dossier_id).eq('traveller_id', v.traveller_id)
    if (error) return fromDbError(error)
    return ok('Voyageur retiré du dossier')
  }
  const { error } = await supabase.from('dossier_travellers').update({ room_label: v.room_label ?? null, special_requests: v.special_requests ?? null, is_lead: bool(formData.get('is_lead')) })
    .eq('dossier_id', v.dossier_id).eq('traveller_id', v.traveller_id)
  if (error) return fromDbError(error)
  return ok('Voyageur mis à jour')
}

// ---------------------------------------------------------------------------
// Participants MICE
// ---------------------------------------------------------------------------

const ATTENDANCE = z.enum(['invited', 'registered', 'confirmed', 'cancelled', 'attended'])

export async function addParticipant(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    dossier_id: uuid, full_name: z.string().min(2, 'Nom obligatoire'), company: z.string().optional(), group_label: z.string().optional(),
    email: z.email('E-mail invalide').optional(), phone: z.string().optional(), attendance: ATTENDANCE.default('invited'),
    arrival_at: z.string().optional(), departure_at: z.string().optional(), room_needs: z.string().optional(), constraints: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const { error } = await supabase.from('event_participants').insert({
    ...v, email: v.email?.toLowerCase() ?? null, company: v.company ?? null, group_label: v.group_label ?? null, phone: v.phone ?? null,
    arrival_at: zonedLocalToIso(v.arrival_at), departure_at: zonedLocalToIso(v.departure_at), room_needs: v.room_needs ?? null, constraints: v.constraints ?? null,
  })
  if (error) return error.code === '23505' ? fail('Un participant avec cet e-mail existe déjà dans ce dossier') : fromDbError(error)
  return ok('Participant ajouté')
}

export async function updateParticipant(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({ id: uuid, attendance: ATTENDANCE, group_label: z.string().optional(), room_needs: z.string().optional() }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { data, error } = await supabase.from('event_participants').update({ attendance: parsed.data.attendance, group_label: parsed.data.group_label ?? null, room_needs: parsed.data.room_needs ?? null }).eq('id', parsed.data.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('Participant mis à jour')
}

/**
 * Import CSV des participants (EVT03) avec contrôle des doublons par e-mail :
 * doublons dans le fichier et avec la liste existante signalés, jamais importés deux fois.
 */
export async function importParticipants(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const dossierId = uuid.safeParse(formData.get('dossier_id'))
  if (!dossierId.success) return fail('Dossier inconnu')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return fail('Choisir un fichier CSV')
  if (file.size > 1024 * 1024) return fail('Fichier trop volumineux (1 Mo maximum)')
  const text = await file.text()
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows = parseCsv(text, delimiter)
  if (rows.length < 2) return fail('Fichier vide : une ligne d’en-tête puis une ligne par participant')
  const header = rows[0]!.map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const idx = (...names: string[]) => header.findIndex((h) => names.includes(h))
  const iName = idx('nom', 'full_name', 'name', 'nom complet', 'participant')
  const iEmail = idx('email', 'e-mail', 'courriel', 'mail')
  if (iName < 0) return fail('Colonne « nom » introuvable (colonnes acceptées : nom, email, telephone, entreprise, groupe, chambre, contraintes)')
  const iPhone = idx('telephone', 'phone', 'tel')
  const iCompany = idx('entreprise', 'company', 'societe')
  const iGroup = idx('groupe', 'group', 'atelier')
  const iRoom = idx('chambre', 'room', 'besoins chambre')
  const iConstraints = idx('contraintes', 'constraints', 'regime')

  const supabase = await db()
  const { data: existing } = await supabase.from('event_participants').select('email').eq('dossier_id', dossierId.data)
  const known = new Set((existing ?? []).map((e) => e.email?.toLowerCase()).filter(Boolean))
  const seen = new Set<string>()
  const toInsert: TablesInsert<'event_participants'>[] = []
  const issues: string[] = []
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const name = (r[iName] ?? '').trim()
    const email = iEmail >= 0 ? (r[iEmail] ?? '').trim().toLowerCase() : ''
    if (!name) { issues.push(`Ligne ${line} : nom manquant`); return }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { issues.push(`Ligne ${line} : e-mail invalide (${email})`); return }
    if (email && known.has(email)) { issues.push(`Ligne ${line} : ${email} déjà inscrit (ignoré)`); return }
    if (email && seen.has(email)) { issues.push(`Ligne ${line} : ${email} en double dans le fichier (ignoré)`); return }
    if (email) seen.add(email)
    const cell = (k: number) => (k >= 0 ? (r[k] ?? '').trim() || null : null)
    toInsert.push({ dossier_id: dossierId.data, full_name: name, email: email || null, phone: cell(iPhone), company: cell(iCompany), group_label: cell(iGroup), room_needs: cell(iRoom), constraints: cell(iConstraints), attendance: 'invited' })
  })
  if (toInsert.length) {
    const { error } = await supabase.from('event_participants').insert(toInsert)
    if (error) return fromDbError(error)
  }
  refreshAll()
  return {
    ok: toInsert.length > 0,
    message: `${toInsert.length} participant(s) importé(s)${issues.length ? ` — ${issues.length} ligne(s) écartée(s) :\n${issues.slice(0, 20).join('\n')}` : ''}`,
    error: toInsert.length === 0 ? `Aucun participant importé.\n${issues.slice(0, 20).join('\n')}` : undefined,
  }
}

// ---------------------------------------------------------------------------
// Échéancier client (librement paramétrable par dossier)
// ---------------------------------------------------------------------------

export async function saveScheduleItem(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('dossiers', 'read')
  if (!session.can('dossiers', 'update') && !session.can('finance', 'update')) return fail('Accès refusé : modification de l’échéancier non autorisée')
  const parsed = z.object({
    id: uuid.optional(), dossier_id: uuid, label: z.string().min(2, 'Libellé obligatoire'), kind: z.enum(['deposit', 'installment', 'balance']),
    amount: z.coerce.number().positive('Montant > 0'), due_date: optDate,
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  if (formData.has('remove') && v.id) {
    const { data, error } = await supabase.from('payment_schedule_items').delete().eq('id', v.id).select('id')
    if (error) return fromDbError(error)
    if (!data?.length) return fail(NOT_ALLOWED)
    return ok('Échéance supprimée')
  }
  if (v.id) {
    const { data, error } = await supabase.from('payment_schedule_items').update({ label: v.label, kind: v.kind, amount: v.amount, due_date: v.due_date ?? null }).eq('id', v.id).select('id')
    if (error) return fromDbError(error)
    if (!data?.length) return fail(NOT_ALLOWED)
    return ok('Échéance mise à jour')
  }
  const { data: last } = await supabase.from('payment_schedule_items').select('seq').eq('dossier_id', v.dossier_id).order('seq', { ascending: false }).limit(1).maybeSingle()
  const { error } = await supabase.from('payment_schedule_items').insert({ dossier_id: v.dossier_id, seq: (last?.seq ?? 0) + 1, label: v.label, kind: v.kind, amount: v.amount, due_date: v.due_date ?? null })
  if (error) return fromDbError(error)
  return ok('Échéance ajoutée')
}

// ---------------------------------------------------------------------------
// Contrôle avant départ
// ---------------------------------------------------------------------------

export async function generateChecklist(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const id = uuid.safeParse(formData.get('dossier_id'))
  if (!id.success) return fail('Dossier inconnu')
  const supabase = await db()
  const { data, error } = await supabase.rpc('generate_departure_checklist', { p_dossier_id: id.data })
  if (error) return fromDbError(error)
  return ok(`Checklist à jour : ${data} contrôle(s)`)
}

export async function updateCheck(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    id: uuid, status: z.enum(['ok', 'to_complete', 'blocking', 'na']), owner_id: z.string().optional(),
    proof_document_id: z.string().optional(), note: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.status === 'na' && !v.note) return { ok: false, error: 'Justifier « Non applicable » par une note', fieldErrors: { note: ['Obligatoire'] } }
  const supabase = await db()
  const { data, error } = await supabase.from('dossier_checks').update({
    status: v.status, owner_id: v.owner_id || null, proof_document_id: v.proof_document_id || null, note: v.note ?? null,
  }).eq('id', v.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('Contrôle mis à jour')
}

// ---------------------------------------------------------------------------
// Incidents, réclamations et modifications
// ---------------------------------------------------------------------------

export async function saveIncident(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'update')
  const parsed = z.object({
    id: uuid.optional(), dossier_id: uuid, supplier_id: z.string().optional(), kind: z.enum(['incident', 'complaint', 'modification', 'cancellation']).default('incident'),
    title: z.string().min(3, 'Intitulé obligatoire'), description: z.string().optional(), owner_id: z.string().optional(), due_at: z.string().optional(),
    cost_impact: z.coerce.number().optional(), status: z.enum(['open', 'in_progress', 'resolved', 'closed']).default('open'), resolution: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (['resolved', 'closed'].includes(v.status) && !v.resolution) return { ok: false, error: 'Décrire la résolution', fieldErrors: { resolution: ['Obligatoire'] } }
  const supabase = await db()
  const row = {
    dossier_id: v.dossier_id, supplier_id: v.supplier_id || null, kind: v.kind, title: v.title, description: v.description ?? null,
    owner_id: v.owner_id || null, due_at: zonedLocalToIso(v.due_at), cost_impact: formData.get('cost_impact') === '' ? null : (v.cost_impact ?? null),
    status: v.status, resolution: v.resolution ?? null,
  }
  const { error } = v.id ? await supabase.from('incidents').update(row).eq('id', v.id) : await supabase.from('incidents').insert(row)
  if (error) return fromDbError(error)
  return ok(v.id ? 'Incident mis à jour' : 'Incident enregistré')
}

