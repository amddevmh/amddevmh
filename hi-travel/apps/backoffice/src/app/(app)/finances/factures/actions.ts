'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@hi/db/server'
import type { Enums } from '@hi/db'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { activeTaxRules } from '@/lib/fin/data'
import { noticeUrl, parseAmount, todayTunis } from '@/lib/fin/format'

const lineSchema = z.object({
  description: z.string().trim().min(1, 'Libellé de ligne requis'),
  quantity: z.coerce.number().positive('Quantité positive requise'),
  unit_price: z.coerce.number().min(0, 'Prix unitaire positif requis'),
  tax_code: z.string().optional().nullable(),
  activity: z.string().optional().nullable(),
  service_id: z.string().optional().nullable(),
})

const createSchema = z.object({
  kind: z.enum(['invoice', 'proforma']),
  client_id: z.guid('Client payeur requis'),
  dossier_id: z.guid().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.string().min(2),
})

async function taxRateFor(supabase: Awaited<ReturnType<typeof createClient>>, code: string | null | undefined, date: string) {
  if (!code) return 0
  const rules = await activeTaxRules(supabase, date, 'vat')
  const rule = rules.find((r) => r.code === code)
  if (!rule) throw new Error(`Code de taxe inconnu ou non en vigueur : ${code}`)
  return Number(rule.rate ?? 0)
}

/** Brouillon de facture ou pro forma (aucun numéro avant validation). */
export async function createInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'create')
  const parsed = createSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  let lines: z.infer<typeof lineSchema>[]
  try {
    lines = z.array(lineSchema).min(1, 'Au moins une ligne').parse(JSON.parse(parsed.data.lines))
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : 'Lignes invalides'
    return { ok: false, error: msg ?? 'Lignes invalides' }
  }
  const supabase = await createClient()
  const date = todayTunis()
  let rated: Array<z.infer<typeof lineSchema> & { tax_rate: number }>
  try {
    rated = await Promise.all(lines.map(async (l) => ({ ...l, tax_rate: await taxRateFor(supabase, l.tax_code, date) })))
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const { data: inv, error } = await supabase
    .from('invoices')
    .insert({
      kind: parsed.data.kind,
      client_id: parsed.data.client_id,
      dossier_id: parsed.data.dossier_id ?? null,
      due_date: parsed.data.due_date ?? null,
      notes: parsed.data.notes ?? null,
      status: 'draft',
    })
    .select('id')
    .single()
  if (error || !inv) return fromDbError(error)

  const { error: lErr } = await supabase.from('invoice_lines').insert(
    rated.map((l, i) => ({
      invoice_id: inv.id,
      position: i + 1,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_code: l.tax_code || null,
      tax_rate: l.tax_rate,
      activity: (l.activity || null) as Enums<'activity'> | null,
      service_id: l.service_id || null,
    })),
  )
  if (lErr) return fromDbError(lErr)
  revalidatePath('/finances/factures')
  redirect(`/finances/factures/${inv.id}`)
}

export async function addInvoiceLine(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'update')
  const raw = formToObject(formData)
  const invoiceId = z.guid().safeParse(raw.invoice_id)
  if (!invoiceId.success) return { ok: false, error: 'Facture inconnue' }
  const parsed = lineSchema.safeParse({ ...raw, quantity: parseAmount(raw.quantity) ?? 1, unit_price: parseAmount(raw.unit_price) })
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  let rate = 0
  try {
    rate = await taxRateFor(supabase, parsed.data.tax_code, todayTunis())
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  const { count } = await supabase.from('invoice_lines').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId.data)
  const { error } = await supabase.from('invoice_lines').insert({
    invoice_id: invoiceId.data,
    position: (count ?? 0) + 1,
    description: parsed.data.description,
    quantity: parsed.data.quantity,
    unit_price: parsed.data.unit_price,
    tax_code: parsed.data.tax_code || null,
    tax_rate: rate,
  })
  if (error) return fromDbError(error)
  revalidatePath(`/finances/factures/${invoiceId.data}`)
  return { ok: true, message: 'Ligne ajoutée' }
}

export async function deleteInvoiceLine(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'update')
  const lineId = String(formData.get('line_id') ?? '')
  const invoiceId = String(formData.get('invoice_id') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.from('invoice_lines').delete().eq('id', lineId)
  if (error) return fromDbError(error)
  revalidatePath(`/finances/factures/${invoiceId}`)
  return { ok: true, message: 'Ligne supprimée' }
}

export async function validateInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'validate')
  const id = String(formData.get('invoice_id') ?? '')
  const issueDate = String(formData.get('issue_date') ?? '') || todayTunis()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('validate_invoice', { p_invoice_id: id, p_issue_date: issueDate })
  if (error) return fromDbError(error)
  revalidatePath(`/finances/factures/${id}`)
  revalidatePath('/finances/factures')
  revalidatePath('/comptabilite')
  redirect(noticeUrl(`/finances/factures/${id}`, 'invoice_validated', data))
}

export async function cancelDraftInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'update')
  const id = String(formData.get('invoice_id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!reason) return { ok: false, error: 'Motif d’annulation requis', fieldErrors: { reason: ['Motif requis'] } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_draft_invoice', { p_invoice_id: id, p_reason: reason })
  if (error) return fromDbError(error)
  revalidatePath(`/finances/factures/${id}`)
  revalidatePath('/finances/factures')
  redirect(noticeUrl(`/finances/factures/${id}`, 'invoice_cancelled'))
}

const creditSchema = z.object({
  original_id: z.guid(),
  reason: z.string().trim().min(3, 'Motif de l’avoir requis'),
  description: z.string().trim().optional(),
  amount: z.number({ error: 'Montant requis' }).positive('Montant positif requis'),
  tax_code: z.string().optional(),
  validate_now: z.string().optional(),
})

/** Avoir sur facture validée : motif obligatoire, montant ≤ restant (contrôlé par la base à la validation). */
export async function createCreditNote(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('finance', 'create')
  const raw = formToObject(formData)
  const parsed = creditSchema.safeParse({ ...raw, amount: parseAmount(raw.amount) })
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { data: orig, error: oErr } = await supabase
    .from('invoices').select('id, number, kind, status, client_id, dossier_id, departure_id').eq('id', parsed.data.original_id).single()
  if (oErr || !orig) return fromDbError(oErr, 'Facture d’origine introuvable')
  if (orig.kind !== 'invoice' || orig.status !== 'validated') return { ok: false, error: 'Un avoir référence une facture validée' }

  let rate = 0
  try {
    rate = await taxRateFor(supabase, parsed.data.tax_code, todayTunis())
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  // Le montant saisi est TTC : la base HT est déduite du taux choisi
  const ht = Math.round((parsed.data.amount / (1 + rate)) * 1000) / 1000

  const { data: cn, error } = await supabase
    .from('invoices')
    .insert({
      kind: 'credit_note',
      status: 'draft',
      client_id: orig.client_id,
      dossier_id: orig.dossier_id,
      departure_id: orig.departure_id,
      original_invoice_id: orig.id,
      reason: parsed.data.reason,
    })
    .select('id')
    .single()
  if (error || !cn) return fromDbError(error)
  const { error: lErr } = await supabase.from('invoice_lines').insert({
    invoice_id: cn.id,
    position: 1,
    description: parsed.data.description || `Avoir sur facture ${orig.number} — ${parsed.data.reason}`,
    quantity: 1,
    unit_price: ht,
    tax_code: parsed.data.tax_code || null,
    tax_rate: rate,
  })
  if (lErr) return fromDbError(lErr)

  if (parsed.data.validate_now && session.can('finance', 'validate')) {
    const { error: vErr } = await supabase.rpc('validate_invoice', { p_invoice_id: cn.id, p_issue_date: todayTunis() })
    if (vErr) {
      revalidatePath(`/finances/factures/${orig.id}`)
      return { ...fromDbError(vErr), id: cn.id, error: `Avoir créé en brouillon mais non validé : ${vErr.message}` }
    }
  }
  revalidatePath(`/finances/factures/${orig.id}`)
  revalidatePath('/finances/factures')
  redirect(`/finances/factures/${cn.id}`)
}
