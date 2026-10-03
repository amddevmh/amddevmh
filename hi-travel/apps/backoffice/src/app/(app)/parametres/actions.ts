'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@hi/db/admin'
import { createClient } from '@hi/db/server'
import type { Enums, Json } from '@hi/db'
import { ACTIVITIES } from '@hi/core'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { MODULES, ACTIONS, ROLES } from '@/lib/admin/permissions'
import { parseAmount } from '@/lib/fin/format'
import { authErrorMessage, PASSWORD_MIN, type PasswordActionState } from '@/lib/password'

// ---------------------------------------------------------------------------
// Utilisateurs
// ---------------------------------------------------------------------------
const userSchema = z.object({
  email: z.email('E-mail invalide'),
  full_name: z.string().trim().min(3, 'Nom complet requis'),
  role: z.enum(ROLES),
  password: z.string().min(12, 'Mot de passe initial : 12 caractères minimum'),
  backup_id: z.guid().optional(),
})

/** Création d'un compte collaborateur : contrôle des droits AVANT tout appel à la clé service. */
export async function createStaffUser(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const parsed = userSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: v.email.toLowerCase(), password: v.password, email_confirm: true, user_metadata: { full_name: v.full_name },
  })
  if (error || !created.user) return { ok: false, error: error?.message.includes('already') ? 'Un compte existe déjà avec cet e-mail' : `Création du compte impossible : ${error?.message}` }
  // Profil créé avec la session de l'administrateur : la RLS (settings.update) s'applique
  const supabase = await createClient()
  const { error: pErr } = await supabase.from('staff_profiles').insert({
    id: created.user.id, email: v.email.toLowerCase(), full_name: v.full_name, role: v.role, backup_id: v.backup_id ?? null,
  })
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id)
    return fromDbError(pErr)
  }
  revalidatePath('/parametres')
  return { ok: true, message: `Compte créé pour ${v.full_name}. Communiquez le mot de passe initial par un canal sûr ; il devra être changé.` }
}

export async function updateStaff(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('settings', 'update')
  const raw = formToObject(formData)
  const parsed = z.object({
    id: z.guid(), role: z.enum(ROLES), backup_id: z.guid().optional(), active: z.boolean(),
  }).safeParse({ ...raw, active: raw.active === '1' })
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.id === session.userId && (!v.active || v.role !== session.profile.role)) {
    return { ok: false, error: 'Vous ne pouvez pas désactiver votre propre compte ni changer votre rôle' }
  }
  if (v.backup_id === v.id) return { ok: false, error: 'Un collaborateur ne peut être son propre suppléant' }
  const supabase = await createClient()
  const { data: before } = await supabase.from('staff_profiles').select('active').eq('id', v.id).maybeSingle()
  const { error } = await supabase.from('staff_profiles').update({ role: v.role as Enums<'app_role'>, backup_id: v.backup_id ?? null, active: v.active }).eq('id', v.id)
  if (error) return fromDbError(error)
  // Désactivation : révocation des sessions (compte bloqué côté authentification)
  if (before && before.active !== v.active) {
    const admin = createAdminClient()
    await admin.auth.admin.updateUserById(v.id, { ban_duration: v.active ? 'none' : '876000h' })
  }
  revalidatePath('/parametres')
  return { ok: true, message: before && before.active && !v.active ? 'Compte désactivé et sessions révoquées' : 'Collaborateur mis à jour' }
}

/**
 * Réinitialisation du mot de passe d’un collaborateur par la direction (settings.update).
 * Son propre mot de passe se change depuis « Mon compte » (vérification du mot de passe actuel).
 */
export async function resetStaffPassword(_: PasswordActionState, formData: FormData): Promise<PasswordActionState> {
  const session = await requireStaff('settings', 'update')
  const parsed = z.object({
    id: z.guid(),
    password: z.string().min(PASSWORD_MIN, `${PASSWORD_MIN} caractères minimum`).max(72, '72 caractères maximum'),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.id === session.userId) return { ok: false, error: 'Pour votre propre compte, utilisez « Mon compte » (le mot de passe actuel y est demandé).' }
  const supabase = await createClient()
  const { data: target } = await supabase.from('staff_profiles').select('id, full_name, email').eq('id', v.id).maybeSingle()
  if (!target) return { ok: false, error: 'Collaborateur introuvable' }
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(v.id, { password: v.password })
  if (error) return { ok: false, error: authErrorMessage(error, 'Réinitialisation impossible') }
  return { ok: true, message: `Mot de passe de ${target.full_name} réinitialisé`, password: v.password, email: target.email, issuedAt: Date.now() }
}

// ---------------------------------------------------------------------------
// Matrice des droits (rôle × module × action), changements audités avec motif
// ---------------------------------------------------------------------------
export async function savePermissions(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length < 5) return { ok: false, error: 'Motif du changement obligatoire (journal d’audit)', fieldErrors: { reason: ['Motif requis'] } }
  const supabase = await createClient()
  const { data: current } = await supabase.from('role_permissions').select('role, module, action')
  const has = new Set((current ?? []).map((p) => `${p.role}:${p.module}:${p.action}`))
  const changes: Array<{ role: Enums<'app_role'>; mod: string; action: Enums<'perm_action'>; granted: boolean }> = []
  for (const role of ROLES) for (const mod of MODULES) for (const action of ACTIONS) {
    const key = `${role}:${mod}:${action}`
    const want = formData.get(`perm:${key}`) === '1'
    if (want !== has.has(key)) changes.push({ role, mod, action, granted: want })
  }
  if (changes.length === 0) return { ok: true, message: 'Aucun changement' }
  for (const c of changes) {
    const { error } = await supabase.rpc('set_role_permission', { p_role: c.role, p_module: c.mod, p_action: c.action, p_granted: c.granted, p_reason: reason })
    if (error) return fromDbError(error)
  }
  revalidatePath('/parametres/droits')
  return { ok: true, message: `${changes.length} droit(s) modifié(s) : ${changes.slice(0, 6).map((c) => `${c.granted ? '+' : '−'} ${c.role}/${c.mod}/${c.action}`).join(', ')}${changes.length > 6 ? '…' : ''}` }
}

// ---------------------------------------------------------------------------
// Règles fiscales par date d'effet (FIN08) — aucun taux figé dans le code
// ---------------------------------------------------------------------------
export async function saveTaxRule(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const raw = formToObject(formData)
  const parsed = z.object({
    code: z.string().trim().regex(/^[A-Z0-9_]+$/, 'Code en majuscules (ex. VAT_STD)'),
    label: z.string().trim().min(3),
    kind: z.enum(['vat', 'stamp', 'withholding']),
    rate_pct: z.number().min(0).max(100).optional(),
    fixed_amount: z.number().min(0).optional(),
    effective_from: z.string().min(10),
    effective_to: z.string().optional(),
    validated_by_accountant: z.boolean(),
  }).refine((v) => v.rate_pct != null || v.fixed_amount != null, { message: 'Taux ou montant fixe requis', path: ['rate_pct'] })
    .safeParse({ ...raw, rate_pct: parseAmount(raw.rate_pct), fixed_amount: parseAmount(raw.fixed_amount), validated_by_accountant: raw.validated_by_accountant === '1' })
  if (!parsed.success) return fromZod(parsed)
  const { rate_pct, ...v } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('tax_rules').insert({
    ...v, rate: rate_pct != null ? Math.round(rate_pct * 100) / 10000 : null, fixed_amount: v.fixed_amount ?? null, effective_to: v.effective_to ?? null,
  })
  if (error) return fromDbError(error)
  revalidatePath('/parametres/fiscalite')
  return { ok: true, message: `Règle ${v.code} ajoutée à compter du ${v.effective_from}` }
}

export async function updateTaxRule(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const id = String(formData.get('id') ?? '')
  const effective_to = String(formData.get('effective_to') ?? '') || null
  const validated = formData.get('validated_by_accountant') === '1'
  const supabase = await createClient()
  const { error } = await supabase.from('tax_rules').update({ effective_to, validated_by_accountant: validated }).eq('id', id)
  if (error) return fromDbError(error)
  revalidatePath('/parametres/fiscalite')
  return { ok: true, message: 'Règle mise à jour' }
}

// ---------------------------------------------------------------------------
// Séries de numérotation
// ---------------------------------------------------------------------------
export async function saveNumberSeries(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const raw = formToObject(formData)
  const parsed = z.object({
    code: z.string().min(2),
    prefix: z.string().trim().regex(/^[A-Z0-9]{1,6}$/, 'Préfixe : 1 à 6 lettres majuscules ou chiffres'),
    label: z.string().trim().min(2),
    padding: z.number().int().min(3).max(10),
    per_year: z.boolean(),
  }).safeParse({ ...raw, padding: Number(raw.padding), per_year: raw.per_year === '1' })
  if (!parsed.success) return fromZod(parsed)
  const { code, ...rest } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('number_series').update(rest).eq('code', code)
  if (error) return fromDbError(error)
  revalidatePath('/parametres/numerotation')
  return { ok: true, message: `Série ${code} mise à jour (s’applique aux prochains numéros, les pièces existantes conservent le leur).` }
}

// ---------------------------------------------------------------------------
// Paramètres applicatifs (audités avec motif)
// ---------------------------------------------------------------------------
async function setSetting(key: string, value: unknown, reason: string): Promise<ActionState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_app_setting', { p_key: key, p_value: value as Json, p_reason: reason })
  if (error) return fromDbError(error)
  return { ok: true }
}

export async function saveThresholds(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const raw = formToObject(formData)
  const parsed = z.object({
    red_hours: z.number().int().min(1).max(168),
    escalation_hours: z.number().int().min(1).max(720),
    reason: z.string().trim().min(5, 'Motif obligatoire'),
  }).safeParse({ red_hours: Number(raw.red_hours), escalation_hours: Number(raw.escalation_hours), reason: raw.reason })
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { data: cur } = await supabase.from('app_settings').select('value').eq('key', 'priority_thresholds').maybeSingle()
  const res = await setSetting('priority_thresholds', { ...((cur?.value ?? {}) as object), red_hours: parsed.data.red_hours, escalation_hours: parsed.data.escalation_hours }, parsed.data.reason)
  if (!res.ok) return res
  revalidatePath('/parametres/urgences')
  return { ok: true, message: 'Seuils appliqués ; le changement est historisé avec son motif.' }
}

export async function saveChannels(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const reason = String(formData.get('reason') ?? '').trim() || 'Paramétrage des canaux'
  const supabase = await createClient()
  const { data: cur } = await supabase.from('app_settings').select('value').eq('key', 'channels').maybeSingle()
  const value = {
    ...((cur?.value ?? {}) as object),
    email_auto_send: formData.get('email_auto_send') === '1',
    whatsapp_auto_send: formData.get('whatsapp_auto_send') === '1',
    email_sender: String(formData.get('email_sender') ?? '').trim() || null,
    whatsapp_number: String(formData.get('whatsapp_number') ?? '').trim() || null,
  }
  const res = await setSetting('channels', value, reason)
  if (!res.ok) return res
  revalidatePath('/parametres/canaux')
  return { ok: true, message: 'Canaux mis à jour' }
}

export async function saveOnlinePayment(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const account = String(formData.get('treasury_account_id') ?? '')
  if (!z.guid().safeParse(account).success) return { ok: false, error: 'Compte de trésorerie requis' }
  const supabase = await createClient()
  const { data: cur } = await supabase.from('app_settings').select('value').eq('key', 'online_payment').maybeSingle()
  const r1 = await setSetting('online_payment', {
    ...((cur?.value ?? {}) as object),
    enabled: formData.get('enabled') === '1',
    manual_instructions: String(formData.get('manual_instructions') ?? '').trim(),
  }, 'Paramètres du paiement en ligne')
  if (!r1.ok) return r1
  const r2 = await setSetting('online_payment_account', { treasury_account_id: account }, 'Compte crédité par le paiement en ligne')
  if (!r2.ok) return r2
  revalidatePath('/parametres/paiement')
  return { ok: true, message: 'Paiement en ligne mis à jour' }
}

export async function saveAssignmentRules(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('settings', 'update')
  const supabase = await createClient()
  const rows = ACTIVITIES.map((a) => ({ activity: a, owner_id: String(formData.get(`owner_${a}`) ?? '') || null }))
  const { error } = await supabase.from('lead_assignment_rules').upsert(rows, { onConflict: 'activity' })
  if (error) return fromDbError(error)
  revalidatePath('/parametres/affectation')
  return { ok: true, message: 'Règles d’affectation enregistrées (sans responsable : file « à attribuer »).' }
}
