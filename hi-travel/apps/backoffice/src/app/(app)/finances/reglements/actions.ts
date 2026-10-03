'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@hi/db/server'
import type { Enums } from '@hi/db'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { noticeUrl, parseAmount, todayTunis } from '@/lib/fin/format'

const allocSchema = z.object({
  invoice_id: z.string().optional(),
  dossier_id: z.string().optional(),
  supplier_invoice_id: z.string().optional(),
  amount: z.number().positive(),
})

const paymentSchema = z.object({
  idempotency_key: z.string().min(16, 'Clé d’idempotence manquante : rechargez la page'),
  direction: z.enum(['in', 'out']),
  kind: z.enum(['payment', 'refund']),
  party: z.enum(['client', 'supplier']),
  client_id: z.guid().optional(),
  supplier_id: z.guid().optional(),
  method: z.enum(['cash', 'transfer', 'card', 'cheque', 'bill', 'online']),
  amount: z.number({ error: 'Montant requis' }).positive('Montant positif requis'),
  currency: z.string().length(3).default('TND'),
  fx_rate: z.number().positive('Taux de change invalide').default(1),
  received_at: z.string().min(10, 'Date de réception requise'),
  treasury_account_id: z.guid().optional(),
  external_ref: z.string().optional(),
  instrument_number: z.string().optional(),
  due_date: z.string().optional(),
  drawer_bank: z.string().optional(),
  notes: z.string().optional(),
  fees: z.number().min(0).default(0),
  withholding: z.number().min(0).default(0),
  validate_now: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.party === 'client' && !v.client_id) ctx.addIssue({ code: 'custom', path: ['client_id'], message: 'Client requis' })
  if (v.party === 'supplier' && !v.supplier_id) ctx.addIssue({ code: 'custom', path: ['supplier_id'], message: 'Fournisseur requis' })
  if ((v.method === 'cheque' || v.method === 'bill') && !v.instrument_number) {
    ctx.addIssue({ code: 'custom', path: ['instrument_number'], message: 'Numéro de chèque ou de traite requis' })
  }
  if (v.method === 'bill' && !v.due_date) ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'Échéance de la traite requise' })
  if (v.validate_now && !v.treasury_account_id) {
    ctx.addIssue({ code: 'custom', path: ['treasury_account_id'], message: 'Compte de caisse ou de banque requis pour valider' })
  }
})

/**
 * Enregistrement idempotent : la clé est générée une seule fois au rendu du formulaire.
 * Une nouvelle soumission du même formulaire renvoie le règlement existant, sans doublon (REC02, REC08).
 */
export async function recordPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('finance', 'create')
  const raw = formToObject(formData)
  const parsed = paymentSchema.safeParse({
    ...raw,
    amount: parseAmount(raw.amount),
    fx_rate: parseAmount(raw.fx_rate) ?? 1,
    fees: parseAmount(raw.fees) ?? 0,
    withholding: parseAmount(raw.withholding) ?? 0,
  })
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  let allocations: z.infer<typeof allocSchema>[] = []
  try {
    allocations = z.array(allocSchema).parse(JSON.parse(String(formData.get('allocations') ?? '[]')))
  } catch {
    return { ok: false, error: 'Ventilation invalide : vérifiez les montants affectés' }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase.from('payments').select('id, reference').eq('idempotency_key', v.idempotency_key).maybeSingle()
  if (existing) {
    return { ok: true, id: existing.id, message: `Règlement ${existing.reference} déjà enregistré : la nouvelle soumission n’a créé aucun doublon.` }
  }

  const { data: pay, error } = await supabase.rpc('record_payment', {
    p_idempotency_key: v.idempotency_key,
    p_direction: v.direction,
    p_kind: v.kind,
    p_method: v.method as Enums<'payment_method'>,
    p_amount: v.amount,
    p_client_id: v.party === 'client' ? v.client_id : undefined,
    p_supplier_id: v.party === 'supplier' ? v.supplier_id : undefined,
    p_allocations: allocations.map((a) => ({
      ...(a.invoice_id ? { invoice_id: a.invoice_id } : {}),
      ...(a.dossier_id ? { dossier_id: a.dossier_id } : {}),
      ...(a.supplier_invoice_id ? { supplier_invoice_id: a.supplier_invoice_id } : {}),
      amount: a.amount,
    })),
    p_received_at: v.received_at,
    p_treasury_account_id: v.treasury_account_id,
    p_currency: v.currency,
    p_fx_rate: v.fx_rate,
    p_external_ref: v.external_ref,
    p_instrument_number: v.instrument_number,
    p_due_date: v.due_date,
    p_validate: !!v.validate_now && session.can('finance', 'validate'),
    p_notes: v.notes,
    p_fees: v.fees,
    p_withholding: v.withholding,
  })
  if (error || !pay) return fromDbError(error)
  if (v.drawer_bank) {
    await supabase.from('payments').update({ drawer_bank: v.drawer_bank }).eq('id', pay.id)
  }
  revalidatePath('/finances/reglements')
  revalidatePath('/finances/factures')
  revalidatePath('/finances/tresorerie')
  return {
    ok: true,
    id: pay.id,
    message: `Règlement ${pay.reference} enregistré (${pay.status === 'validated' ? 'validé' : 'reçu, à valider'}).`,
  }
}

export async function validatePayment(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'validate')
  const id = String(formData.get('payment_id') ?? '')
  const account = String(formData.get('treasury_account_id') ?? '')
  const valueDate = String(formData.get('value_date') ?? '') || undefined
  const supabase = await createClient()
  if (account) {
    const { error } = await supabase.from('payments').update({ treasury_account_id: account }).eq('id', id).in('status', ['received', 'deposited', 'planned'])
    if (error) return fromDbError(error)
  }
  const { error } = await supabase.rpc('validate_payment', { p_payment_id: id, p_value_date: valueDate })
  if (error) return fromDbError(error)
  revalidatePath(`/finances/reglements/${id}`)
  revalidatePath('/finances/reglements')
  revalidatePath('/finances/tresorerie')
  redirect(noticeUrl(`/finances/reglements/${id}`, 'payment_validated'))
}

export async function rejectPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'validate')
  const id = String(formData.get('payment_id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  const fees = parseAmount(String(formData.get('fees') ?? '')) ?? 0
  if (!reason) return { ok: false, error: 'Motif de rejet obligatoire', fieldErrors: { reason: ['Motif requis'] } }
  if (Number.isNaN(fees) || fees < 0) return { ok: false, error: 'Frais de rejet invalides' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_payment', { p_payment_id: id, p_reason: reason, p_fees: fees })
  if (error) return fromDbError(error)
  revalidatePath(`/finances/reglements/${id}`)
  revalidatePath('/finances/reglements')
  revalidatePath('/finances/tresorerie')
  redirect(noticeUrl(`/finances/reglements/${id}`, 'payment_rejected'))
}

export async function reversePayment(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'validate')
  const id = String(formData.get('payment_id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!reason) return { ok: false, error: 'Motif obligatoire', fieldErrors: { reason: ['Motif requis'] } }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reverse_payment', { p_payment_id: id, p_reason: reason })
  if (error) return fromDbError(error)
  revalidatePath('/finances/reglements')
  revalidatePath('/finances/tresorerie')
  redirect(noticeUrl(`/finances/reglements/${data}`, 'payment_reversed'))
}

const addAllocSchema = z.object({
  payment_id: z.guid(),
  target: z.string().min(3, 'Cible requise'),
  amount: z.number({ error: 'Montant requis' }).positive('Montant positif requis'),
})

/** Affectation complémentaire du solde non affecté (contrôlée par la base : jamais au-delà du disponible). */
export async function addAllocation(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'create')
  const raw = formToObject(formData)
  const parsed = addAllocSchema.safeParse({ ...raw, amount: parseAmount(raw.amount) })
  if (!parsed.success) return fromZod(parsed)
  const [type, targetId] = parsed.data.target.split(':')
  if (!targetId || !['invoice', 'dossier', 'supplier_invoice'].includes(type ?? '')) return { ok: false, error: 'Cible inconnue' }
  const supabase = await createClient()
  const { error } = await supabase.from('payment_allocations').insert({
    payment_id: parsed.data.payment_id,
    amount: parsed.data.amount,
    invoice_id: type === 'invoice' ? targetId : null,
    dossier_id: type === 'dossier' ? targetId : null,
    supplier_invoice_id: type === 'supplier_invoice' ? targetId : null,
    note: raw.note ?? null,
  })
  if (error) return fromDbError(error)
  revalidatePath(`/finances/reglements/${parsed.data.payment_id}`)
  return { ok: true, message: 'Affectation enregistrée' }
}

/** Bordereau de remise en banque de chèques / traites reçus. */
export async function createDepositSlip(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'create')
  const account = String(formData.get('treasury_account_id') ?? '')
  const ids = formData.getAll('payment_ids').map(String).filter(Boolean)
  const date = String(formData.get('deposit_date') ?? '') || todayTunis()
  if (!account) return { ok: false, error: 'Compte bancaire de remise requis' }
  if (ids.length === 0) return { ok: false, error: 'Sélectionnez au moins un chèque ou une traite' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_deposit_slip', { p_treasury_account_id: account, p_payment_ids: ids, p_date: date })
  if (error) return fromDbError(error)
  revalidatePath('/finances/reglements')
  redirect(`/finances/reglements/bordereaux/${data}`)
}
