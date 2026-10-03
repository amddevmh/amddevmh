'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@hi/db/admin'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { authErrorMessage, findAuthUserIdByEmail, PASSWORD_MIN, type PasswordActionState } from '@/lib/password'

/*
 * Accès à l’espace client du site (table client_accounts : compte d’authentification ↔ fiche client).
 * Droit requis : crm.update (même règle que la RLS de client_accounts). La clé service n’est
 * utilisée qu’APRÈS ce contrôle, pour les seules opérations sur auth.users.
 * Les mots de passe ne sont jamais journalisés : seul l’événement est consigné dans les échanges.
 */

const passwordSchema = z.string().min(PASSWORD_MIN, `${PASSWORD_MIN} caractères minimum`).max(72, '72 caractères maximum')

/** Trace dans les échanges consignés de la fiche (sans le mot de passe). Sans effet bloquant. */
async function logEvent(clientId: string, summary: string) {
  const supabase = await db()
  await supabase.from('interactions').insert({ client_id: clientId, channel: 'note', summary })
}

/** Le compte doit être rattaché à CETTE fiche client et ne pas être un compte collaborateur. */
async function linkedAccount(clientId: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await db()
  const [{ data: link }, { data: staff }] = await Promise.all([
    supabase.from('client_accounts').select('user_id').eq('user_id', userId).eq('client_id', clientId).maybeSingle(),
    supabase.from('staff_profiles').select('id').eq('id', userId).maybeSingle(),
  ])
  if (!link) return { ok: false, error: 'Aucun accès à l’espace client ne correspond à ce compte pour ce client' }
  if (staff) return { ok: false, error: 'Ce compte est un compte collaborateur : il ne peut pas être géré depuis la fiche client' }
  return { ok: true }
}

export async function createClientAccess(_: PasswordActionState, formData: FormData): Promise<PasswordActionState> {
  await requireStaff('crm', 'update')
  const parsed = z.object({
    client_id: z.guid(),
    email: z.email('Adresse e-mail invalide'),
    password: passwordSchema,
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const email = parsed.data.email.toLowerCase()
  const { client_id: clientId, password } = parsed.data
  const supabase = await db()

  const { data: client } = await supabase.from('clients').select('id, display_name, merged_into_id').eq('id', clientId).maybeSingle()
  if (!client) return { ok: false, error: 'Fiche client introuvable' }
  if (client.merged_into_id) return { ok: false, error: 'Cette fiche a été fusionnée : créez l’accès sur la fiche conservée' }
  const { data: existing } = await supabase.from('client_accounts').select('user_id').eq('client_id', clientId).limit(1)
  if (existing?.length) return { ok: false, error: 'Ce client a déjà un accès à l’espace client' }

  // Une adresse de collaborateur ne peut pas devenir un accès client
  const { data: staffByEmail } = await supabase.from('staff_profiles').select('id').eq('email', email).limit(1)
  if (staffByEmail?.length) {
    return { ok: false, error: 'Cette adresse est celle d’un compte collaborateur : utilisez une autre adresse pour l’espace client', fieldErrors: { email: ['Adresse d’un collaborateur'] } }
  }

  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: client.display_name, kind: 'client' },
  })
  if (error || !created.user) {
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists' || error?.message.includes('already')) {
      const userId = await findAuthUserIdByEmail(admin, email)
      if (userId) {
        const [{ data: staff }, { data: link }] = await Promise.all([
          supabase.from('staff_profiles').select('id').eq('id', userId).maybeSingle(),
          supabase.from('client_accounts').select('client_id, clients(display_name)').eq('user_id', userId).maybeSingle(),
        ])
        if (staff) return { ok: false, error: 'Cette adresse est celle d’un compte collaborateur : utilisez une autre adresse pour l’espace client', fieldErrors: { email: ['Adresse d’un collaborateur'] } }
        if (link) {
          const other = link.client_id === clientId ? 'ce client' : `la fiche « ${link.clients?.display_name ?? 'autre client'} »`
          return { ok: false, error: `Cette adresse donne déjà accès à l’espace client pour ${other}`, fieldErrors: { email: ['Adresse déjà rattachée'] } }
        }
      }
      return { ok: false, error: 'Un compte d’authentification existe déjà avec cette adresse : choisissez une autre adresse ou contactez la direction', fieldErrors: { email: ['Adresse déjà utilisée'] } }
    }
    return { ok: false, error: authErrorMessage(error, 'Création du compte impossible') }
  }

  // Rattachement avec la session du collaborateur : la RLS (crm.update) s’applique
  const { error: linkError } = await supabase.from('client_accounts').insert({ user_id: created.user.id, client_id: clientId })
  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return fromDbError(linkError)
  }
  await logEvent(clientId, `Accès à l’espace client créé (identifiant ${email})`)
  revalidatePath(`/crm/clients/${clientId}`)
  return { ok: true, message: 'Accès à l’espace client créé', password, email, issuedAt: Date.now() }
}

export async function resetClientAccessPassword(_: PasswordActionState, formData: FormData): Promise<PasswordActionState> {
  await requireStaff('crm', 'update')
  const parsed = z.object({ client_id: z.guid(), user_id: z.guid(), password: passwordSchema }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const { client_id: clientId, user_id: userId, password } = parsed.data
  const check = await linkedAccount(clientId, userId)
  if (!check.ok) return check

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error || !data.user) return { ok: false, error: authErrorMessage(error, 'Réinitialisation impossible') }
  await logEvent(clientId, `Mot de passe de l’espace client réinitialisé (identifiant ${data.user.email ?? '—'})`)
  revalidatePath(`/crm/clients/${clientId}`)
  return { ok: true, message: 'Mot de passe réinitialisé', password, email: data.user.email, issuedAt: Date.now() }
}

export async function revokeClientAccess(_: PasswordActionState, formData: FormData): Promise<PasswordActionState> {
  await requireStaff('crm', 'update')
  const parsed = z.object({
    client_id: z.guid(),
    user_id: z.guid(),
    reason: z.string().trim().min(5, 'Motif obligatoire (5 caractères minimum)'),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return { ...fromZod(parsed), error: parsed.error.issues[0]?.message ?? 'Saisie invalide' }
  const { client_id: clientId, user_id: userId, reason } = parsed.data
  const check = await linkedAccount(clientId, userId)
  if (!check.ok) return check

  const supabase = await db()
  const admin = createAdminClient()
  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  const email = authUser.user?.email ?? '—'

  // 1. Suppression du rattachement (RLS crm.update) ; 2. suppression du compte d’authentification.
  // La fiche client et son historique sont conservés.
  const { data: removed, error: delError } = await supabase.from('client_accounts').delete().eq('user_id', userId).eq('client_id', clientId).select('user_id')
  if (delError) return fromDbError(delError)
  if (!removed?.length) return { ok: false, error: 'Révocation refusée : droits insuffisants ou accès introuvable' }
  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  await logEvent(clientId, `Accès à l’espace client révoqué (identifiant ${email}) — motif : ${reason}`)
  revalidatePath(`/crm/clients/${clientId}`)
  if (authError) {
    return { ok: true, message: `Accès révoqué : le compte n’est plus rattaché à la fiche, mais la suppression du compte d’authentification a échoué (${authError.message}). Prévenez la direction.` }
  }
  return { ok: true, message: `Accès révoqué pour ${email} : l’identifiant ne permet plus de se connecter. La fiche client est conservée.` }
}
