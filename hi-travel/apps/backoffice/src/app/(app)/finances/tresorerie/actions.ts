'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@hi/db/server'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { parseAmount, todayTunis } from '@/lib/fin/format'
import { expectedBalanceAt } from '@/lib/fin/treasury'

const transferSchema = z.object({
  from: z.guid('Compte de départ requis'),
  to: z.guid('Compte d’arrivée requis'),
  amount: z.number({ error: 'Montant requis' }).positive('Montant positif requis'),
  date: z.string().min(10),
  label: z.string().trim().min(1).default('Transfert interne'),
})

/** Transfert interne : deux mouvements liés, aucun revenu (REC10). */
export async function transferFunds(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'create')
  const raw = formToObject(formData)
  const parsed = transferSchema.safeParse({ ...raw, amount: parseAmount(raw.amount), date: raw.date ?? todayTunis(), label: raw.label ?? 'Transfert interne' })
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { error } = await supabase.rpc('transfer_funds', {
    p_from: parsed.data.from, p_to: parsed.data.to, p_amount: parsed.data.amount, p_date: parsed.data.date, p_label: parsed.data.label,
  })
  if (error) return fromDbError(error)
  revalidatePath('/finances/tresorerie')
  return { ok: true, message: 'Transfert enregistré : deux mouvements liés, sans effet sur le chiffre d’affaires.' }
}

const closingSchema = z.object({
  account: z.guid(),
  date: z.string().min(10),
  counted: z.number({ error: 'Solde compté requis' }),
  justification: z.string().trim().optional(),
})

/** Clôture de caisse : solde théorique vs compté, écart obligatoirement justifié. */
export async function closeCash(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'validate')
  const raw = formToObject(formData)
  const parsed = closingSchema.safeParse({ ...raw, counted: parseAmount(raw.counted) })
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const expected = await expectedBalanceAt(supabase, parsed.data.account, parsed.data.date)
  if (expected == null) return { ok: false, error: 'Compte introuvable' }
  const diff = Math.round((parsed.data.counted - expected) * 1000) / 1000
  if (diff !== 0 && !parsed.data.justification) {
    return { ok: false, error: `Écart de ${diff.toFixed(3)} DT : justification obligatoire`, fieldErrors: { justification: ['Justification requise'] } }
  }
  const { error } = await supabase.from('cash_closings').insert({
    treasury_account_id: parsed.data.account,
    closing_date: parsed.data.date,
    expected_balance: expected,
    counted_balance: parsed.data.counted,
    justification: parsed.data.justification ?? null,
  })
  if (error) return fromDbError(error)
  revalidatePath('/finances/tresorerie')
  return { ok: true, message: diff === 0 ? 'Caisse clôturée sans écart.' : `Caisse clôturée avec un écart justifié de ${diff.toFixed(3)} DT.` }
}

/** Rapprochement bancaire manuel (phase 1) : seul l'indicateur « rapproché » est modifiable. */
export async function setReconciled(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('finance', 'update')
  const ids = formData.getAll('movement_ids').map(String).filter(Boolean)
  const value = formData.get('value') === '1'
  if (ids.length === 0) return { ok: false, error: 'Aucun mouvement sélectionné' }
  const supabase = await createClient()
  const { error } = await supabase.from('treasury_movements').update({ reconciled: value }).in('id', ids)
  if (error) return fromDbError(error)
  revalidatePath('/finances/tresorerie')
  return { ok: true, message: `${ids.length} mouvement(s) ${value ? 'rapproché(s)' : 'à rapprocher'}` }
}
