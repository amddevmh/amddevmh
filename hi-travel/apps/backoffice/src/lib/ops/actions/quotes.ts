'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { computeQuoteTotals, toMinor, type PaxType } from '@hi/core'
import type { Json, TablesInsert } from '@hi/db'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { todayIso } from '@/lib/ops/format'
import { fail, NOT_ALLOWED, ok, refreshAll } from '@/lib/ops/server'
import type { PaymentTermPayload, QuoteVersionPayload } from '@/lib/ops/types'

const ACTIVITY = z.enum(['hotel_tn', 'hotel_intl', 'tailor_made', 'organized_trip', 'visa', 'ticketing', 'circuit', 'transport', 'mice'])
const SERVICE_TYPE = z.enum(['flight', 'hotel', 'transfer', 'excursion', 'visa', 'transport', 'circuit', 'package', 'event_item', 'insurance', 'fee', 'other'])
const isoDate = z.iso.date('Date invalide')

const createSchema = z.object({
  client_id: z.guid('Client obligatoire'),
  lead_id: z.guid().optional(),
  activity: ACTIVITY,
  title: z.string().min(3, 'Intitulé obligatoire'),
  departure_id: z.guid().optional(),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
  adults: z.coerce.number().int().min(0).default(1),
  children: z.coerce.number().int().min(0).default(0),
  infants: z.coerce.number().int().min(0).default(0),
  language: z.enum(['fr', 'en']).default('fr'),
  valid_until: isoDate.optional(),
})

/** Création d’un devis (vierge, depuis une demande ou depuis un départ/offre) avec sa version 1. */
export async function createQuote(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('quotes', 'create')
  const parsed = createSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()

  let departure: { id: string; offer_id: string; start_date: string; end_date: string; price_adult: number | null; price_child: number | null; price_infant: number | null; deposit_amount: number | null; booking_deadline: string | null; currency: string } | null = null
  let offer: { id: string; title: string; activity: string; inclusions: string[]; exclusions: string[]; program: Json; conditions: string | null } | null = null
  if (v.departure_id) {
    const { data } = await supabase.from('departures').select('id, offer_id, start_date, end_date, price_adult, price_child, price_infant, deposit_amount, booking_deadline, currency').eq('id', v.departure_id).maybeSingle()
    departure = data
    if (departure) {
      const { data: o } = await supabase.from('offers').select('id, title, activity, inclusions, exclusions, program, conditions').eq('id', departure.offer_id).maybeSingle()
      offer = o
    }
  }

  const { data: quote, error } = await supabase.from('quotes').insert({
    client_id: v.client_id,
    lead_id: v.lead_id ?? null,
    activity: v.activity,
    title: v.title,
    offer_id: offer?.id ?? null,
    departure_id: departure?.id ?? null,
  }).select('id').single()
  if (error) return fromDbError(error)

  const start = v.start_date ?? departure?.start_date ?? null
  const end = v.end_date ?? departure?.end_date ?? null
  const lines: Array<Omit<TablesInsert<'quote_lines'>, 'version_id'>> = []
  const terms: Array<Record<string, unknown>> = []
  if (departure && offer) {
    const base = { activity: v.activity, service_type: 'package' as const, start_date: start, end_date: end, unit_cost: 0 }
    if (v.adults > 0 && departure.price_adult != null) lines.push({ ...base, position: 1, description: `${offer.title} — adulte`, pax_type: 'adult', quantity: v.adults, unit_price: departure.price_adult })
    if (v.children > 0) lines.push({ ...base, position: 2, description: `${offer.title} — enfant`, pax_type: 'child', quantity: v.children, unit_price: departure.price_child ?? departure.price_adult ?? 0 })
    if (v.infants > 0) lines.push({ ...base, position: 3, description: `${offer.title} — bébé`, pax_type: 'infant', quantity: v.infants, unit_price: departure.price_infant ?? 0 })
    const total = lines.reduce((a, l) => a + toMinor((l.unit_price ?? 0) * (l.quantity ?? 1)), 0) / 1000
    const deposit = (departure.deposit_amount ?? 0) * (v.adults + v.children)
    if (deposit > 0 && deposit < total) {
      terms.push({ label: 'Acompte à la réservation', kind: 'deposit', amount: deposit, due_date: todayIso() })
      terms.push({ label: 'Solde', kind: 'balance', amount: Math.round((total - deposit) * 1000) / 1000, ...(departure.booking_deadline ? { due_date: departure.booking_deadline } : { days_before_departure: 0 }) })
    }
  }

  const { data: version, error: vErr } = await supabase.from('quote_versions').insert({
    quote_id: quote.id,
    version_no: 1,
    language: v.language,
    start_date: start,
    end_date: end,
    adults: v.adults,
    children: v.children,
    infants: v.infants,
    currency: departure?.currency ?? 'TND',
    valid_until: v.valid_until ?? null,
    inclusions: offer?.inclusions ?? [],
    exclusions: offer?.exclusions ?? [],
    program: (offer?.program ?? []) as NonNullable<Json>,
    payment_terms: terms as NonNullable<Json>,
    client_notes: offer?.conditions ?? null,
  }).select('id').single()
  if (vErr) return fromDbError(vErr)
  if (lines.length) {
    const { error: lErr } = await supabase.from('quote_lines').insert(lines.map((l) => ({ ...l, version_id: version.id })))
    if (lErr) return fromDbError(lErr)
  }
  if (v.lead_id) {
    await supabase.from('leads').update({ stage: 'quote' }).eq('id', v.lead_id).in('stage', ['received', 'qualification'])
  }
  refreshAll()
  redirect(`/devis/${quote.id}?v=${version.id}`)
}

const lineSchema = z.object({
  id: z.guid().optional(),
  activity: ACTIVITY,
  service_type: SERVICE_TYPE,
  description: z.string().min(2, 'Description de ligne obligatoire'),
  supplier_id: z.guid().nullable(),
  start_date: isoDate.nullable(),
  end_date: isoDate.nullable(),
  pax_type: z.enum(['adult', 'child', 'infant', 'all']),
  quantity: z.number().positive('Quantité > 0'),
  unit_cost: z.number().min(0, 'Coût ≥ 0'),
  cost_currency: z.string().length(3),
  fx_rate: z.number().positive('Taux de change > 0'),
  unit_price: z.number().min(0, 'Prix ≥ 0'),
  is_optional: z.boolean(),
  option_selected: z.boolean(),
  is_mandatory: z.boolean(),
  room_type: z.string().optional(),
  board: z.string().optional(),
})

const termSchema = z.object({
  label: z.string().min(1, 'Libellé d’échéance obligatoire'),
  kind: z.enum(['deposit', 'installment', 'balance']),
  mode: z.enum(['amount', 'percent']),
  value: z.number().positive('Montant ou pourcentage > 0'),
  due: z.enum(['date', 'days']),
  due_date: z.string().optional(),
  days_before_departure: z.number().int().min(0).optional(),
})

const versionSchema = z.object({
  version_id: z.guid(),
  label: z.string(),
  language: z.enum(['fr', 'en']),
  start_date: isoDate.nullable(),
  end_date: isoDate.nullable(),
  adults: z.number().int().min(0),
  children: z.number().int().min(0),
  infants: z.number().int().min(0),
  currency: z.string().length(3),
  valid_until: isoDate.nullable(),
  inclusions: z.array(z.string()),
  exclusions: z.array(z.string()),
  client_notes: z.string(),
  internal_notes: z.string(),
  program: z.array(z.object({ day: z.number().int().min(1), title: z.string(), description: z.string() })),
  lines: z.array(lineSchema),
  terms: z.array(termSchema),
})

function termsToJson(terms: PaymentTermPayload[]): NonNullable<Json> {
  return terms.map((t) => ({
    label: t.label,
    kind: t.kind,
    ...(t.mode === 'amount' ? { amount: t.value } : { percent: t.value }),
    ...(t.due === 'date' ? { due_date: t.due_date || null } : { days_before_departure: t.days_before_departure ?? 0 }),
  })) as NonNullable<Json>
}

/** Montants de l’échéancier, selon la même règle que accept_quote_version (pourcentage arrondi à 3 décimales). */
function scheduleTotal(terms: PaymentTermPayload[], total: number): number {
  return terms.reduce((a, t) => a + (t.mode === 'amount' ? toMinor(t.value) : Math.round((toMinor(total) * t.value) / 100)), 0) / 1000
}

/** Enregistre l’en-tête, les lignes et l’échéancier d’une version brouillon. */
export async function saveQuoteVersion(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('quotes', 'update')
  let payload: QuoteVersionPayload
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return fail('Données du devis illisibles')
  }
  const parsed = versionSchema.safeParse(payload)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return fail(`Saisie invalide${first ? ` (${first.path.join('.')}) : ${first.message}` : ''}`)
  }
  const v = parsed.data
  if (v.start_date && v.end_date && v.end_date < v.start_date) return fail('La date de retour précède la date de départ')
  for (const [i, l] of v.lines.entries()) {
    if (l.start_date && l.end_date && l.end_date < l.start_date) return fail(`Ligne ${i + 1} : la date de fin précède la date de début`)
  }
  for (const t of v.terms) {
    if (t.due === 'date' && !t.due_date) return fail(`Échéance « ${t.label} » : indiquer la date, ou choisir « jours avant départ »`)
    if (t.mode === 'percent' && t.value > 100) return fail(`Échéance « ${t.label} » : pourcentage supérieur à 100 %`)
  }
  const supabase = await db()
  const { data: current } = await supabase.from('quote_versions').select('id, status, quote_id').eq('id', v.version_id).maybeSingle()
  if (!current) return fail('Version introuvable')
  if (current.status !== 'draft') return fail(`Version figée (statut ${current.status}) : créer une nouvelle version pour la modifier`)

  const { error: hErr } = await supabase.from('quote_versions').update({
    label: v.label || null, language: v.language, start_date: v.start_date, end_date: v.end_date,
    adults: v.adults, children: v.children, infants: v.infants, currency: v.currency, valid_until: v.valid_until,
    inclusions: v.inclusions, exclusions: v.exclusions, client_notes: v.client_notes || null, internal_notes: v.internal_notes || null,
    program: v.program as NonNullable<Json>, payment_terms: termsToJson(v.terms),
  }).eq('id', v.version_id)
  if (hErr) return fromDbError(hErr)

  const canCosts = session.can('margins')
  const { data: existing } = await supabase.from('quote_lines').select('id').eq('version_id', v.version_id)
  const keep = new Set(v.lines.map((l) => l.id).filter(Boolean))
  const toDelete = (existing ?? []).map((e) => e.id).filter((id) => !keep.has(id))
  if (toDelete.length) {
    const { error } = await supabase.from('quote_lines').delete().in('id', toDelete)
    if (error) return fromDbError(error)
  }
  for (const [i, l] of v.lines.entries()) {
    const details: Record<string, string> = {}
    if (l.room_type) details.room_type = l.room_type
    if (l.board) details.board = l.board
    const row = {
      position: i + 1, activity: l.activity, service_type: l.service_type, description: l.description, supplier_id: l.supplier_id,
      start_date: l.start_date, end_date: l.end_date, pax_type: l.pax_type, quantity: l.quantity, unit_price: l.unit_price,
      is_optional: l.is_optional, option_selected: l.is_optional ? l.option_selected : false, is_mandatory: l.is_mandatory, details,
      // Les coûts internes ne sont modifiables qu’avec le droit « marges »
      ...(canCosts ? { unit_cost: l.unit_cost, cost_currency: l.cost_currency, fx_rate: l.fx_rate } : {}),
    }
    const { error } = l.id
      ? await supabase.from('quote_lines').update(row).eq('id', l.id).eq('version_id', v.version_id)
      : await supabase.from('quote_lines').insert({ ...row, version_id: v.version_id })
    if (error) return fromDbError(error)
  }
  await supabase.from('quotes').update({ status: 'draft' }).eq('id', current.quote_id).eq('status', 'draft')

  const totals = computeQuoteTotals(v.lines.map((l) => ({ paxType: l.pax_type as PaxType, quantity: l.quantity, unitPrice: l.unit_price, unitCost: l.unit_cost, fxRate: l.fx_rate, isOptional: l.is_optional, optionSelected: l.option_selected })))
  const sched = scheduleTotal(v.terms, totals.totalPrice)
  if (v.terms.length && Math.abs(sched - totals.totalPrice) > 0.0005) {
    refreshAll()
    return { ok: true, message: `Version enregistrée. Attention : l’échéancier (${sched.toFixed(3)} DT) ne correspond pas encore au total (${totals.totalPrice.toFixed(3)} DT) ; l’envoi sera refusé tant qu’il n’est pas équilibré.` }
  }
  return ok('Version enregistrée')
}

/** Envoi : contrôles de complétude puis mark_quote_version_sent (la version est figée). */
export async function sendQuoteVersion(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('quotes', 'update')
  const parsed = z.object({ version_id: z.guid(), via: z.enum(['email', 'whatsapp', 'hand', 'phone']).default('email') }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const [{ data: version }, { data: totals }] = await Promise.all([
    supabase.from('quote_versions').select('id, status, valid_until, payment_terms, start_date').eq('id', parsed.data.version_id).maybeSingle(),
    supabase.from('quote_version_totals').select('total_price').eq('version_id', parsed.data.version_id).maybeSingle(),
  ])
  if (!version) return fail('Version introuvable')
  const total = Number(totals?.total_price ?? 0)
  if (total <= 0) return fail('Le devis ne contient aucune prestation chiffrée')
  if (!version.valid_until) return fail('Indiquer la date de validité du devis avant l’envoi')
  const terms = (Array.isArray(version.payment_terms) ? version.payment_terms : []) as Array<Record<string, unknown>>
  if (terms.length) {
    const sum = terms.reduce<number>((a, t) => a + (t.amount != null ? toMinor(Number(t.amount)) : Math.round((toMinor(total) * Number(t.percent ?? 0)) / 100)), 0) / 1000
    if (Math.abs(sum - total) > 0.0005) return fail(`Échéancier déséquilibré : ${sum.toFixed(3)} DT prévus pour un total de ${total.toFixed(3)} DT`)
    if (!version.start_date && terms.some((t) => t.due_date == null)) return fail('Une échéance exprimée en jours avant départ nécessite la date de départ')
  }
  const { error } = await supabase.rpc('mark_quote_version_sent', { p_version_id: parsed.data.version_id, p_via: parsed.data.via })
  if (error) return fromDbError(error)
  return ok('Envoi enregistré : la version est désormais figée')
}

export async function newQuoteVersion(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('quotes', 'update')
  const parsed = z.object({ quote_id: z.guid(), from_version_id: z.guid().optional() }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { data, error } = await supabase.rpc('create_quote_version', { p_quote_id: parsed.data.quote_id, p_from_version_id: parsed.data.from_version_id })
  if (error) return fromDbError(error)
  refreshAll()
  redirect(`/devis/${parsed.data.quote_id}?v=${data}`)
}

/** Acceptation : accept_quote_version crée le dossier (idempotent), puis ouverture du dossier. */
export async function acceptQuoteVersion(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('quotes', 'validate')
  const parsed = z.object({ version_id: z.guid(), note: z.string().optional() }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { data: dossierId, error } = await supabase.rpc('accept_quote_version', { p_version_id: parsed.data.version_id, p_note: parsed.data.note })
  if (error) return fromDbError(error)
  refreshAll()
  redirect(`/dossiers/${dossierId}`)
}

/** Refus du client : la version et le devis passent « Refusé » avec le motif ; la demande peut être marquée perdue. */
export async function rejectQuote(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('quotes', 'update')
  const parsed = z.object({ quote_id: z.guid(), version_id: z.guid(), reason: z.string().min(3, 'Motif obligatoire') }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const { data: quote } = await supabase.from('quotes').select('id, status, lead_id').eq('id', v.quote_id).maybeSingle()
  if (!quote) return fail('Devis introuvable')
  if (quote.status === 'accepted') return fail('Devis déjà accepté : les modifications passent par le dossier')
  const { data: upd, error } = await supabase.from('quote_versions')
    .update({ status: 'rejected', responded_at: new Date().toISOString(), response_note: v.reason })
    .eq('id', v.version_id).in('status', ['draft', 'sent']).select('id')
  if (error) return fromDbError(error)
  if (!upd?.length) return fail(NOT_ALLOWED)
  const { error: qErr } = await supabase.from('quotes').update({ status: 'rejected', lost_reason: v.reason }).eq('id', v.quote_id)
  if (qErr) return fromDbError(qErr)
  if (quote.lead_id && formData.get('lead_lost') === 'on') {
    await supabase.from('leads').update({ stage: 'lost', lost_reason: v.reason }).eq('id', quote.lead_id)
  }
  return ok('Refus enregistré')
}
