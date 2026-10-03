'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@hi/db/server'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { noticeUrl, parseAmount, todayTunis } from '@/lib/fin/format'

function refresh() {
  revalidatePath('/comptabilite')
  revalidatePath('/comptabilite/journal')
  revalidatePath('/comptabilite/grand-livre')
  revalidatePath('/comptabilite/balance')
}

/** Validation atomique d'une pièce : contrôles (compte, période, référence, équilibre) faits par la base. */
export async function postEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('accounting', 'validate')
  const id = String(formData.get('entry_id') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('post_journal_entry', { p_entry_id: id })
  if (error) return { ...fromDbError(error), error: `Validation refusée : ${error.message}. Aucune ligne n’a été comptabilisée.` }
  refresh()
  redirect(noticeUrl('/comptabilite', 'entry_posted', data))
}

export async function reverseEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('accounting', 'validate')
  const id = String(formData.get('entry_id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  const date = String(formData.get('date') ?? '') || todayTunis()
  if (!reason) return { ok: false, error: 'Motif de contrepassation obligatoire' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('reverse_journal_entry', { p_entry_id: id, p_reason: reason, p_date: date })
  if (error) return fromDbError(error)
  refresh()
  return { ok: true, message: 'Contrepassation validée' }
}

const lineSchema = z.object({
  account_code: z.string().trim().min(2, 'Compte requis'),
  label: z.string().optional().nullable(),
  debit: z.number().min(0),
  credit: z.number().min(0),
})
const entrySchema = z.object({
  entry_id: z.guid().optional(),
  journal_code: z.string().min(1, 'Journal requis'),
  entry_date: z.string().min(10, 'Date requise'),
  piece_ref: z.string().trim().min(1, 'Référence de pièce requise'),
  label: z.string().trim().min(1, 'Libellé requis'),
  post_now: z.string().optional(),
})

/**
 * Saisie manuelle (OD) en brouillard. Les comptes inconnus et les déséquilibres sont acceptés
 * en brouillard mais refusés par la base à la validation (REC11).
 */
export async function saveManualEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('accounting', 'create')
  const raw = formToObject(formData)
  const parsed = entrySchema.safeParse(raw)
  if (!parsed.success) return fromZod(parsed)
  let lines: z.infer<typeof lineSchema>[]
  try {
    const arr = JSON.parse(String(formData.get('lines') ?? '[]')) as Array<Record<string, string>>
    lines = z.array(lineSchema).min(2, 'Une pièce comporte au moins deux lignes').parse(
      arr.filter((l) => l.account_code || l.debit || l.credit).map((l) => ({
        account_code: l.account_code ?? '', label: l.label || null, debit: parseAmount(l.debit) ?? 0, credit: parseAmount(l.credit) ?? 0,
      })),
    )
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? 'Lignes invalides' : 'Lignes invalides' }
  }
  if (lines.some((l) => l.debit > 0 && l.credit > 0)) return { ok: false, error: 'Une ligne porte soit un débit, soit un crédit' }

  const supabase = await createClient()
  const v = parsed.data
  let entryId = v.entry_id
  if (entryId) {
    const { data: cur } = await supabase.from('journal_entries').select('status').eq('id', entryId).maybeSingle()
    if (!cur) return { ok: false, error: 'Pièce introuvable' }
    if (cur.status !== 'draft') return { ok: false, error: 'Écriture validée : correction par contrepassation uniquement' }
    const { error } = await supabase.from('journal_entries').update({
      journal_code: v.journal_code, entry_date: v.entry_date, piece_ref: v.piece_ref, label: v.label,
    }).eq('id', entryId)
    if (error) return fromDbError(error)
    const { error: dErr } = await supabase.from('journal_lines').delete().eq('entry_id', entryId)
    if (dErr) return fromDbError(dErr)
  } else {
    const { data, error } = await supabase.from('journal_entries').insert({
      journal_code: v.journal_code, entry_date: v.entry_date, piece_ref: v.piece_ref, label: v.label, source_type: 'manual',
    }).select('id').single()
    if (error || !data) return fromDbError(error)
    entryId = data.id
  }
  const { error: lErr } = await supabase.from('journal_lines').insert(lines.map((l) => ({ entry_id: entryId!, ...l })))
  if (lErr) return fromDbError(lErr)

  if (v.post_now && session.can('accounting', 'validate')) {
    const { data: num, error } = await supabase.rpc('post_journal_entry', { p_entry_id: entryId })
    refresh()
    if (error) return { ok: false, id: entryId, error: `Pièce enregistrée en brouillard, validation refusée : ${error.message}` }
    return { ok: true, id: entryId, message: `Pièce validée sous le n° ${num}` }
  }
  refresh()
  return { ok: true, id: entryId, message: 'Pièce enregistrée en brouillard.' }
}

export async function deleteDraftEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('accounting', 'update')
  const id = String(formData.get('entry_id') ?? '')
  const supabase = await createClient()
  const { error, count } = await supabase.from('journal_entries').delete({ count: 'exact' }).eq('id', id).eq('status', 'draft').eq('source_type', 'manual')
  if (error) return fromDbError(error)
  if (!count) return { ok: false, error: 'Seule une saisie manuelle en brouillard peut être supprimée' }
  refresh()
  redirect('/comptabilite')
}

export async function closePeriod(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('accounting', 'validate')
  const id = String(formData.get('period_id') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.rpc('close_fiscal_period', { p_period_id: id })
  if (error) return fromDbError(error)
  revalidatePath('/comptabilite/periodes')
  redirect(noticeUrl('/comptabilite/periodes', 'period_closed'))
}

export async function reopenPeriod(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'validate')
  const id = String(formData.get('period_id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length < 5) return { ok: false, error: 'Motif de réouverture obligatoire (5 caractères minimum)' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('reopen_fiscal_period', { p_period_id: id, p_reason: reason })
  if (error) return fromDbError(error)
  revalidatePath('/comptabilite/periodes')
  redirect(noticeUrl('/comptabilite/periodes', 'period_reopened'))
}

const periodSchema = z.object({
  label: z.string().trim().min(2, 'Libellé requis'),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
})

export async function createPeriod(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('accounting', 'validate')
  const parsed = periodSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { error } = await supabase.from('fiscal_periods').insert(parsed.data)
  if (error) return fromDbError(error, 'Période invalide ou chevauchant une période existante')
  revalidatePath('/comptabilite/periodes')
  return { ok: true, message: 'Période créée' }
}

const accountSchema = z.object({
  code: z.string().regex(/^[0-9]{2,10}$/, 'Code numérique de 2 à 10 chiffres'),
  label: z.string().trim().min(2, 'Libellé requis'),
  type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
  is_auxiliary: z.boolean(),
  allow_posting: z.boolean(),
  active: z.boolean(),
})

export async function saveAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('accounting', 'update')
  const raw = formToObject(formData)
  const parsed = accountSchema.safeParse({ ...raw, is_auxiliary: raw.is_auxiliary === '1', allow_posting: raw.allow_posting === '1', active: raw.active === '1' })
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { error } = await supabase.from('accounts').upsert(parsed.data, { onConflict: 'code' })
  if (error) return fromDbError(error)
  revalidatePath('/comptabilite/plan')
  return { ok: true, message: `Compte ${parsed.data.code} enregistré` }
}

const ruleSchema = z.object({
  event: z.string().min(1),
  journal_code: z.string().min(1),
  debit_account: z.string().min(2),
  credit_account: z.string().min(2),
  label: z.string().trim().min(2),
  validated_by_accountant: z.boolean(),
})

export async function savePostingRule(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('accounting', 'validate')
  const raw = formToObject(formData)
  const parsed = ruleSchema.safeParse({ ...raw, validated_by_accountant: raw.validated_by_accountant === '1' })
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { event, ...rest } = parsed.data
  const { error } = await supabase.from('posting_rules').update(rest).eq('event', event)
  if (error) return fromDbError(error)
  revalidatePath('/comptabilite/plan')
  return { ok: true, message: `Règle « ${event} » mise à jour` }
}
