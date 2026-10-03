'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@hi/db/server'
import { getFxRate } from '@hi/integrations/fx'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { noticeUrl, parseAmount } from '@/lib/fin/format'

const schema = z.object({
  supplier_id: z.guid('Fournisseur requis'),
  supplier_ref: z.string().trim().min(1, 'Référence fournisseur requise'),
  issue_date: z.string().min(10, 'Date de pièce requise'),
  service_period_start: z.string().optional(),
  service_period_end: z.string().optional(),
  due_date: z.string().optional(),
  currency: z.string().length(3),
  fx_rate: z.number({ error: 'Taux requis' }).positive('Taux positif requis'),
  fx_rate_date: z.string().optional(),
  fx_rate_source: z.string().optional(),
  total_amount: z.number({ error: 'Montant requis' }).positive('Montant positif requis'),
  tax_amount: z.number().min(0).default(0),
  withholding_rule: z.string().optional(),
  withholding_base: z.number().min(0).optional(),
  withholding_amount: z.number().min(0).default(0),
  duplicate_justification: z.string().trim().optional(),
  notes: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.currency !== 'TND' && (!v.fx_rate_date || !v.fx_rate_source)) {
    ctx.addIssue({ code: 'custom', path: ['fx_rate_source'], message: 'Date et source du taux requises pour une devise étrangère' })
  }
  if (v.service_period_start && v.service_period_end && v.service_period_end < v.service_period_start) {
    ctx.addIssue({ code: 'custom', path: ['service_period_end'], message: 'Fin de période antérieure au début' })
  }
})

export async function createSupplierInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'create')
  const raw = formToObject(formData)
  const parsed = schema.safeParse({
    ...raw,
    fx_rate: raw.currency === 'TND' ? 1 : parseAmount(raw.fx_rate),
    total_amount: parseAmount(raw.total_amount),
    tax_amount: parseAmount(raw.tax_amount) ?? 0,
    withholding_base: parseAmount(raw.withholding_base),
    withholding_amount: parseAmount(raw.withholding_amount) ?? 0,
  })
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supplier_invoices')
    .insert({
      ...v,
      fx_rate_date: v.currency === 'TND' ? null : v.fx_rate_date,
      fx_rate_source: v.currency === 'TND' ? null : v.fx_rate_source,
      service_period_start: v.service_period_start ?? null,
      service_period_end: v.service_period_end ?? null,
      due_date: v.due_date ?? null,
      withholding_rule: v.withholding_rule ?? null,
      withholding_base: v.withholding_base ?? null,
      duplicate_justification: v.duplicate_justification || null,
      notes: v.notes ?? null,
    })
    .select('id')
    .single()
  if (error || !data) {
    const res = fromDbError(error)
    if (error?.message.includes('Doublon')) res.fieldErrors = { supplier_ref: [error.message], duplicate_justification: ['Justifiez l’exception pour enregistrer malgré le doublon'] }
    return res
  }
  revalidatePath('/finances/fournisseurs')
  redirect(`/finances/fournisseurs/${data.id}`)
}

/** Proposition de taux daté : table fx_rates si disponible, sinon source simulée (modifiable par l'utilisateur). */
export async function suggestFxRate(currency: string, date: string): Promise<{ rate?: number; date?: string; source?: string; error?: string }> {
  await requireStaff('finance', 'read')
  if (currency === 'TND') return { rate: 1, date, source: 'identité' }
  const supabase = await createClient()
  const { data } = await supabase.from('fx_rates').select('rate_to_tnd, rate_date, source').eq('currency', currency).lte('rate_date', date).order('rate_date', { ascending: false }).limit(1).maybeSingle()
  if (data && data.rate_date === date) return { rate: Number(data.rate_to_tnd), date: data.rate_date, source: data.source }
  try {
    const q = await getFxRate(currency, date)
    return { rate: q.rateToTnd, date: q.rateDate, source: q.source }
  } catch (e) {
    if (data) return { rate: Number(data.rate_to_tnd), date: data.rate_date, source: data.source }
    return { error: (e as Error).message }
  }
}

export async function validateSupplierInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'validate')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.rpc('validate_supplier_invoice', { p_id: id })
  if (error) return fromDbError(error)
  revalidatePath(`/finances/fournisseurs/${id}`)
  revalidatePath('/finances/fournisseurs')
  redirect(noticeUrl(`/finances/fournisseurs/${id}`, 'si_validated'))
}

export async function cancelSupplierInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'update')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { error, count } = await supabase.from('supplier_invoices').update({ status: 'cancelled' }, { count: 'exact' }).eq('id', id).eq('status', 'draft')
  if (error) return fromDbError(error)
  if (!count) return { ok: false, error: 'Seule une pièce en brouillon peut être annulée' }
  revalidatePath(`/finances/fournisseurs/${id}`)
  redirect(noticeUrl(`/finances/fournisseurs/${id}`, 'si_cancelled'))
}

const allocSchema = z.object({
  supplier_invoice_id: z.guid(),
  method: z.enum(['percent', 'nights', 'pax', 'manual']),
  cost_kind: z.enum(['individual', 'common']),
  amount: z.number().positive().optional(),
  targets: z.array(z.object({
    dossier_id: z.string().optional(),
    departure_id: z.string().optional(),
    service_id: z.string().optional(),
    weight: z.number().positive('Chaque poids doit être positif'),
  })).min(1, 'Au moins une cible'),
})

/** Ventilation : la base répartit et porte l'arrondi sur la dernière part, sans jamais dépasser la pièce. */
export async function allocateSupplierInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'create')
  let payload: unknown
  try {
    payload = {
      supplier_invoice_id: formData.get('supplier_invoice_id'),
      method: formData.get('method'),
      cost_kind: formData.get('cost_kind'),
      amount: parseAmount(String(formData.get('amount') ?? '')),
      targets: JSON.parse(String(formData.get('targets') ?? '[]')),
    }
  } catch {
    return { ok: false, error: 'Cibles invalides' }
  }
  const parsed = allocSchema.safeParse(payload)
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('allocate_supplier_invoice', {
    p_supplier_invoice_id: parsed.data.supplier_invoice_id,
    p_targets: parsed.data.targets,
    p_method: parsed.data.method,
    p_amount: parsed.data.amount,
    p_cost_kind: parsed.data.cost_kind,
  })
  if (error) return fromDbError(error)
  revalidatePath(`/finances/fournisseurs/${parsed.data.supplier_invoice_id}`)
  redirect(noticeUrl(`/finances/fournisseurs/${parsed.data.supplier_invoice_id}`, 'si_allocated', String((data ?? []).length)))
}
