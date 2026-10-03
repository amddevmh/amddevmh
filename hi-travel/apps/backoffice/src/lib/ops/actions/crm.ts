'use server'

import { z } from 'zod'
import type { Enums } from '@hi/db'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { zonedLocalToIso } from '@/lib/ops/format'
import { bool, fail, NOT_ALLOWED, ok } from '@/lib/ops/server'
import type { ClientFormState, DuplicateMatch } from '@/lib/ops/types'

const ACTIVITY = z.enum(['hotel_tn', 'hotel_intl', 'tailor_made', 'organized_trip', 'visa', 'ticketing', 'circuit', 'transport', 'mice'])
const SOURCE = z.enum(['website', 'phone', 'walk_in', 'email', 'whatsapp', 'social', 'referral', 'import', 'other'])

const clientSchema = z.object({
  kind: z.enum(['person', 'company']),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company_name: z.string().optional(),
  tax_id: z.string().optional(),
  email: z.email('Adresse e-mail invalide').optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  language: z.enum(['fr', 'en', 'ar']).default('fr'),
  source: SOURCE.default('other'),
  commercial_terms: z.string().optional(),
  notes: z.string().optional(),
  lead_id: z.guid().optional(),
}).superRefine((v, ctx) => {
  if (v.kind === 'person' && !v.last_name && !v.first_name) ctx.addIssue({ code: 'custom', path: ['last_name'], message: 'Nom obligatoire' })
  if (v.kind === 'company' && !v.company_name) ctx.addIssue({ code: 'custom', path: ['company_name'], message: 'Raison sociale obligatoire' })
  if (!v.email && !v.phone) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Un e-mail ou un téléphone est requis' })
})

/**
 * Création d’un client : recherche de doublons AVANT création (find_client_duplicates).
 * En cas de correspondance, la création exige une confirmation explicite — aucune fusion aveugle.
 */
export async function createClientAction(_: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const session = await requireStaff('crm', 'create')
  const parsed = clientSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const name = v.kind === 'company' ? v.company_name : [v.first_name, v.last_name].filter(Boolean).join(' ')

  if (!bool(formData.get('confirm_new'))) {
    const { data: dups, error } = await supabase.rpc('find_client_duplicates', { p_email: v.email ?? '', p_phone: v.phone ?? '', p_name: name ?? undefined })
    if (error) return fromDbError(error)
    const matches = ((dups ?? []) as DuplicateMatch[]).filter((d) => d.match_reason)
    if (matches.length) {
      return {
        ok: false,
        error: `${matches.length} client(s) existant(s) pourrai(en)t correspondre. Vérifiez avant de créer une nouvelle fiche.`,
        duplicates: matches,
      }
    }
  }

  const { data, error } = await supabase.from('clients').insert({
    kind: v.kind,
    first_name: v.kind === 'person' ? v.first_name ?? null : null,
    last_name: v.kind === 'person' ? v.last_name ?? null : null,
    company_name: v.kind === 'company' ? v.company_name ?? null : null,
    tax_id: v.tax_id ?? null,
    email: v.email?.toLowerCase() ?? null,
    phone: v.phone ?? null,
    address: v.address ?? null,
    city: v.city ?? null,
    country: v.country ?? 'TN',
    language: v.language,
    source: v.source,
    commercial_terms: v.commercial_terms ?? null,
    notes: v.notes ?? null,
    owner_id: session.userId,
    consents: {
      processing: bool(formData.get('consent_processing')),
      marketing: bool(formData.get('consent_marketing')),
      collected_at: new Date().toISOString(),
      channel: 'backoffice',
    },
  }).select('id').single()
  if (error) return fromDbError(error)

  if (v.lead_id) {
    await supabase.from('leads').update({ client_id: data.id, possible_duplicate_client_ids: [] }).eq('id', v.lead_id)
  }
  return ok('Client créé', data.id)
}

export async function updateClientAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('crm', 'update')
  const id = z.guid().safeParse(formData.get('id'))
  if (!id.success) return fail('Client inconnu')
  const parsed = clientSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const { data: current } = await supabase.from('clients').select('consents').eq('id', id.data).maybeSingle()
  const prev = (current?.consents ?? {}) as Record<string, unknown>
  const processing = bool(formData.get('consent_processing'))
  const marketing = bool(formData.get('consent_marketing'))
  const consentsChanged = prev.processing !== processing || prev.marketing !== marketing
  const { data, error } = await supabase.from('clients').update({
    first_name: v.kind === 'person' ? v.first_name ?? null : null,
    last_name: v.kind === 'person' ? v.last_name ?? null : null,
    company_name: v.kind === 'company' ? v.company_name ?? null : null,
    tax_id: v.tax_id ?? null,
    email: v.email?.toLowerCase() ?? null,
    phone: v.phone ?? null,
    address: v.address ?? null,
    city: v.city ?? null,
    country: v.country ?? 'TN',
    language: v.language,
    source: v.source,
    commercial_terms: v.commercial_terms ?? null,
    notes: v.notes ?? null,
    consents: consentsChanged ? { ...prev, processing, marketing, collected_at: new Date().toISOString(), channel: 'backoffice' } : prev,
  } as never).eq('id', id.data).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('Fiche client mise à jour')
}

export async function addContact(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('crm', 'update')
  const parsed = z.object({
    client_id: z.guid(), full_name: z.string().min(2, 'Nom obligatoire'), role: z.string().optional(),
    email: z.email('E-mail invalide').optional(), phone: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { error } = await supabase.from('client_contacts').insert({ ...parsed.data, is_decision_maker: bool(formData.get('is_decision_maker')) })
  if (error) return fromDbError(error)
  return ok('Contact ajouté')
}

export async function deleteContact(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('crm', 'update')
  const id = z.guid().safeParse(formData.get('id'))
  if (!id.success) return fail('Contact inconnu')
  const supabase = await db()
  const { data, error } = await supabase.from('client_contacts').delete().eq('id', id.data).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('Contact retiré')
}

const travellerSchema = z.object({
  client_id: z.guid().optional(),
  first_name: z.string().min(1, 'Prénom obligatoire'),
  last_name: z.string().min(1, 'Nom obligatoire'),
  birth_date: z.iso.date('Date invalide').optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  pax_type: z.enum(['adult', 'child', 'infant']).default('adult'),
  email: z.email('E-mail invalide').optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  dossier_id: z.guid().optional(),
})

/** Voyageur (distinct du payeur) ; rattaché au dossier si indiqué. */
export async function addTraveller(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('dossiers', 'read')
  const parsed = travellerSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const { dossier_id, ...v } = parsed.data
  const supabase = await db()
  const { data, error } = await supabase.from('travellers').insert({
    client_id: v.client_id ?? null, first_name: v.first_name, last_name: v.last_name, birth_date: v.birth_date ?? null,
    gender: v.gender ?? null, nationality: v.nationality ?? null, pax_type: v.pax_type, email: v.email ?? null,
    phone: v.phone ?? null, notes: v.notes ?? null,
  }).select('id').single()
  if (error) return fromDbError(error)
  if (dossier_id) {
    const { error: linkError } = await supabase.from('dossier_travellers').insert({ dossier_id, traveller_id: data.id, is_lead: bool(formData.get('is_lead')) })
    if (linkError) return fromDbError(linkError)
  }
  return ok(dossier_id ? 'Voyageur créé et rattaché au dossier' : 'Voyageur ajouté', data.id)
}

/** Pièce d’identité : réservée aux profils habilités (module identity). */
export async function addIdentityDocument(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('identity', 'update')
  const parsed = z.object({
    traveller_id: z.guid(),
    doc_type: z.enum(['passport', 'national_id', 'other']).default('passport'),
    passport_number: z.string().min(4, 'Numéro invalide'),
    issuing_country: z.string().optional(),
    issue_date: z.iso.date().optional(),
    expiry_date: z.iso.date('Date d’expiration invalide').optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { error } = await supabase.from('traveller_identity_documents').insert({
    ...parsed.data, issuing_country: parsed.data.issuing_country ?? null, issue_date: parsed.data.issue_date ?? null, expiry_date: parsed.data.expiry_date ?? null,
  })
  if (error) return fromDbError(error)
  return ok('Pièce d’identité enregistrée')
}

export async function addInteraction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff()
  const parsed = z.object({
    client_id: z.guid().optional(), lead_id: z.guid().optional(), dossier_id: z.guid().optional(),
    channel: z.enum(['note', 'phone', 'email', 'whatsapp', 'meeting', 'site']).default('note'),
    direction: z.enum(['in', 'out']).optional(),
    summary: z.string().min(3, 'Résumé obligatoire'),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (!v.client_id && !v.lead_id && !v.dossier_id) return fail('Échange sans rattachement')
  const supabase = await db()
  const { error } = await supabase.from('interactions').insert({
    client_id: v.client_id ?? null, lead_id: v.lead_id ?? null, dossier_id: v.dossier_id ?? null,
    channel: v.channel, direction: v.direction ?? null, summary: v.summary,
  })
  if (error) return fromDbError(error)
  return ok('Échange consigné')
}

/** Fusion contrôlée (merge_clients) : motif obligatoire, historique et liens conservés. */
export async function mergeClientsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('crm', 'validate')
  const parsed = z.object({ keep: z.guid('Client à conserver obligatoire'), merge: z.guid(), reason: z.string().min(5, 'Motif obligatoire (5 caractères minimum)') })
    .safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { error } = await supabase.rpc('merge_clients', { p_keep: parsed.data.keep, p_merge: parsed.data.merge, p_reason: parsed.data.reason })
  if (error) return fromDbError(error)
  return ok('Fiches fusionnées : la fiche fusionnée est archivée et pointe vers la fiche conservée', parsed.data.keep)
}

// ---------------------------------------------------------------------------
// Demandes (pipeline)
// ---------------------------------------------------------------------------

const leadSchema = z.object({
  client_id: z.guid().optional(),
  activity: ACTIVITY,
  source: SOURCE.default('phone'),
  owner_id: z.guid().optional(),
  destination: z.string().optional(),
  date_from: z.iso.date().optional(),
  date_to: z.iso.date().optional(),
  adults: z.coerce.number().int().min(0).default(1),
  children: z.coerce.number().int().min(0).default(0),
  budget: z.coerce.number().min(0).optional(),
  message: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.email('E-mail invalide').optional(),
  contact_phone: z.string().optional(),
  next_action: z.string().optional(),
})

export async function createLead(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('crm', 'create')
  const parsed = leadSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (!v.client_id && !v.contact_email && !v.contact_phone) {
    return { ok: false, error: 'Choisir un client existant ou indiquer un contact (e-mail ou téléphone)', fieldErrors: { client_id: ['Client ou contact requis'] } }
  }
  const supabase = await db()
  let duplicates: string[] = []
  if (!v.client_id) {
    const { data: dups } = await supabase.rpc('find_client_duplicates', { p_email: v.contact_email ?? '', p_phone: v.contact_phone ?? '', p_name: v.contact_name })
    duplicates = (dups ?? []).filter((d) => d.match_reason).map((d) => d.id)
  }
  const [first, ...rest] = (v.contact_name ?? '').split(' ')
  const { data, error } = await supabase.from('leads').insert({
    client_id: v.client_id ?? null,
    activity: v.activity,
    source: v.source,
    owner_id: v.owner_id ?? session.userId,
    destination: v.destination ?? null,
    date_from: v.date_from ?? null,
    date_to: v.date_to ?? null,
    adults: v.adults,
    children: v.children,
    budget: v.budget ?? null,
    message: v.message ?? null,
    next_action: v.next_action ?? null,
    contact_snapshot: { first_name: first || null, last_name: rest.join(' ') || null, email: v.contact_email ?? null, phone: v.contact_phone ?? null },
    possible_duplicate_client_ids: duplicates,
    processing_consent: true,
  }).select('id').single()
  if (error) return fromDbError(error)
  return ok('Demande créée', data.id)
}

const leadUpdateSchema = z.object({
  id: z.guid(),
  stage: z.enum(['received', 'qualification', 'quote', 'follow_up', 'won', 'lost']).optional(),
  owner_id: z.string().optional(),
  lost_reason: z.string().optional(),
  next_action: z.string().optional(),
  next_action_at: z.string().optional(),
})

/** Étape, responsable, prochaine action ; une demande perdue exige un motif. */
export async function updateLead(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('crm', 'update')
  const parsed = leadUpdateSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.stage === 'lost' && !v.lost_reason) {
    return { ok: false, error: 'Motif de perte obligatoire', fieldErrors: { lost_reason: ['Motif obligatoire'] } }
  }
  const supabase = await db()
  const patch: Record<string, unknown> = {}
  if (v.stage) patch.stage = v.stage as Enums<'lead_stage'>
  if (formData.has('owner_id')) patch.owner_id = v.owner_id || null
  if (formData.has('lost_reason')) patch.lost_reason = v.stage === 'lost' ? v.lost_reason : (v.lost_reason ?? null)
  if (formData.has('next_action')) patch.next_action = v.next_action ?? null
  if (formData.has('next_action_at')) patch.next_action_at = zonedLocalToIso(v.next_action_at)
  const { data, error } = await supabase.from('leads').update(patch as never).eq('id', v.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('Demande mise à jour')
}

/** Choix explicite : rattacher la demande à un client existant (aucune fusion). */
export async function attachLeadToClient(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('crm', 'update')
  const parsed = z.object({ id: z.guid(), client_id: z.guid('Client obligatoire') }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { data, error } = await supabase.from('leads')
    .update({ client_id: parsed.data.client_id, possible_duplicate_client_ids: [] })
    .eq('id', parsed.data.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  await supabase.from('interactions').insert({ lead_id: parsed.data.id, client_id: parsed.data.client_id, channel: 'note', summary: 'Demande rattachée à une fiche client existante après vérification des doublons' })
  return ok('Demande rattachée au client')
}
