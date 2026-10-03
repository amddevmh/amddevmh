'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Json } from '@hi/db'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { bool, fail, NOT_ALLOWED, ok, refreshAll } from '@/lib/ops/server'

const KIND = z.enum(['hotel', 'hotel_platform', 'airline', 'ticketing_platform', 'transport', 'guide', 'restaurant', 'venue', 'event_service', 'visa_center', 'insurance', 'other'])
const list = (v?: string) => (v ?? '').split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)

const supplierSchema = z.object({
  id: z.guid().optional(),
  name: z.string().min(2, 'Nom obligatoire'),
  kind: KIND,
  country: z.string().optional(),
  city: z.string().optional(),
  currency: z.string().length(3, 'Devise à 3 lettres'),
  tax_id: z.string().optional(),
  email: z.email('E-mail invalide').optional(),
  phone: z.string().optional(),
  destinations: z.string().optional(),
  conditions: z.string().optional(),
  payment_terms: z.string().optional(),
  account_code: z.string().optional(),
})

export async function saveSupplier(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('suppliers', formData.get('id') ? 'update' : 'create')
  const parsed = supplierSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const row = {
    name: v.name, kind: v.kind, country: v.country ?? null, city: v.city ?? null, currency: v.currency.toUpperCase(), tax_id: v.tax_id ?? null,
    email: v.email ?? null, phone: v.phone ?? null, destinations: list(v.destinations), conditions: v.conditions ?? null,
    payment_terms: v.payment_terms ?? null, account_code: v.account_code ?? null,
    withholding_applicable: bool(formData.get('withholding_applicable')),
    active: v.id ? bool(formData.get('active')) : true,
  }
  if (v.id) {
    const { data, error } = await supabase.from('suppliers').update(row).eq('id', v.id).select('id')
    if (error) return fromDbError(error)
    if (!data?.length) return fail(NOT_ALLOWED)
    return ok('Fournisseur mis à jour')
  }
  const { data, error } = await supabase.from('suppliers').insert(row).select('id').single()
  if (error) return fromDbError(error)
  refreshAll()
  redirect(`/fournisseurs/${data.id}`)
}

/** Contacts fournisseurs (liste JSON : nom, fonction, e-mail, téléphone). */
export async function saveSupplierContact(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('suppliers', 'update')
  const parsed = z.object({
    supplier_id: z.guid(), index: z.coerce.number().int().optional(), name: z.string().optional(), role: z.string().optional(),
    email: z.email('E-mail invalide').optional(), phone: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const { data: cur } = await supabase.from('suppliers').select('contacts').eq('id', v.supplier_id).maybeSingle()
  if (!cur) return fail('Fournisseur introuvable')
  const contacts = (Array.isArray(cur.contacts) ? cur.contacts : []) as Array<Record<string, string | null>>
  if (formData.has('remove') && v.index != null) {
    contacts.splice(v.index, 1)
  } else {
    if (!v.name) return { ok: false, error: 'Nom du contact obligatoire', fieldErrors: { name: ['Obligatoire'] } }
    contacts.push({ name: v.name, role: v.role ?? null, email: v.email ?? null, phone: v.phone ?? null })
  }
  const { data, error } = await supabase.from('suppliers').update({ contacts: contacts as NonNullable<Json> }).eq('id', v.supplier_id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok(formData.has('remove') ? 'Contact retiré' : 'Contact ajouté')
}

const optDate = z.iso.date('Date invalide').optional()

export async function saveContract(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('suppliers', 'update')
  const parsed = z.object({
    id: z.guid().optional(), supplier_id: z.guid(), title: z.string().min(3, 'Intitulé obligatoire'), valid_from: optDate, valid_to: optDate,
    currency: z.string().length(3), child_rules: z.string().optional(), free_places: z.string().optional(), penalties: z.string().optional(),
    supplements: z.string().optional(), notes: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.valid_from && v.valid_to && v.valid_to < v.valid_from) return fail('La fin de validité précède le début')
  const supabase = await db()
  const row = {
    supplier_id: v.supplier_id, title: v.title, valid_from: v.valid_from ?? null, valid_to: v.valid_to ?? null, currency: v.currency.toUpperCase(),
    child_rules: v.child_rules ?? null, free_places: v.free_places ?? null, penalties: v.penalties ?? null,
    terms: { supplements: v.supplements ?? null, notes: v.notes ?? null } as NonNullable<Json>,
  }
  const { error } = v.id ? await supabase.from('supplier_contracts').update(row).eq('id', v.id) : await supabase.from('supplier_contracts').insert(row)
  if (error) return fromDbError(error)
  return ok(v.id ? 'Contrat mis à jour' : 'Contrat ajouté')
}

export async function saveHotel(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('suppliers', 'update')
  const parsed = z.object({
    id: z.guid().optional(), supplier_id: z.guid().optional(), name: z.string().min(2, 'Nom obligatoire'), country: z.string().min(2).default('TN'),
    city: z.string().min(2, 'Ville obligatoire'), category: z.coerce.number().int().min(1).max(5).optional(), address: z.string().optional(),
    room_types: z.string().optional(), boards: z.string().optional(), child_rules: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const row = {
    supplier_id: v.supplier_id ?? null, name: v.name, country: v.country.toUpperCase(), city: v.city, category: v.category ?? null, address: v.address ?? null,
    room_types: list(v.room_types), boards: list(v.boards).map((b) => b.toUpperCase()), child_rules: v.child_rules ?? null,
  }
  const { error } = v.id ? await supabase.from('hotels').update(row).eq('id', v.id) : await supabase.from('hotels').insert(row)
  if (error) return fromDbError(error)
  return ok(v.id ? 'Hôtel mis à jour' : 'Hôtel ajouté au référentiel')
}

/** Tarifs datés par saison, chambre et pension ; contractuel ou ponctuel distingués. */
export async function saveRate(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('suppliers', 'update')
  const parsed = z.object({
    id: z.guid().optional(), hotel_id: z.guid(), season: z.string().min(2, 'Saison obligatoire'), valid_from: z.iso.date('Début obligatoire'), valid_to: z.iso.date('Fin obligatoire'),
    room_type: z.string().min(1, 'Chambre obligatoire'), board: z.string().min(1, 'Pension obligatoire'), rate_kind: z.enum(['contract', 'spot']),
    price_per_night: z.coerce.number().min(0), single_supplement: z.coerce.number().min(0).default(0), child_discount_pct: z.coerce.number().min(0).max(100).default(0),
    currency: z.string().length(3),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.valid_to < v.valid_from) return fail('La fin de validité précède le début')
  const supabase = await db()
  if (formData.has('remove') && v.id) {
    const { data, error } = await supabase.from('hotel_rates').delete().eq('id', v.id).select('id')
    if (error) return fromDbError(error)
    if (!data?.length) return fail(NOT_ALLOWED)
    return ok('Tarif supprimé')
  }
  const { id, ...row } = { ...v, board: v.board.toUpperCase(), currency: v.currency.toUpperCase() }
  const { error } = id ? await supabase.from('hotel_rates').update(row).eq('id', id) : await supabase.from('hotel_rates').insert(row)
  if (error) return fromDbError(error)
  return ok(id ? 'Tarif mis à jour' : 'Tarif ajouté')
}
