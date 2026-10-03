'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createPublicClient, createSessionClient } from '@/lib/supabase'
import { safeNext, siteUrl } from '@/lib/portal'
import type { FormState } from '@/lib/forms'
import { t } from '@/lib/i18n'

const p = t.portal

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(200) }).safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    password: String(formData.get('password') ?? ''),
  })
  if (!parsed.success) return { status: 'error', error: p.loginError }
  const supabase = await createSessionClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error || !data.user) return { status: 'error', error: p.loginError }
  // Seuls les comptes rattachés à une fiche client accèdent à l'espace client
  const { data: account } = await supabase.from('client_accounts').select('client_id').eq('user_id', data.user.id).maybeSingle()
  if (!account) {
    await supabase.auth.signOut({ scope: 'local' })
    return { status: 'error', error: p.notClient }
  }
  redirect(safeNext(formData.get('next')))
}

export async function logout() {
  const supabase = await createSessionClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/espace-client/connexion')
}

/** Demande de réinitialisation : réponse identique que le compte existe ou non (pas d'énumération). */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = z.email().safeParse(String(formData.get('email') ?? '').trim().toLowerCase())
  if (!email.success) return { status: 'error', error: t.form.errors.email, fieldErrors: { email: t.form.errors.email } }
  const supabase = await createSessionClient()
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent('/espace-client/nouveau-mot-de-passe')}`,
  })
  return { status: 'success', message: p.resetSent }
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (password.length < 12) return { status: 'error', fieldErrors: { password: p.passwordShort }, error: p.passwordShort }
  if (password !== confirm) return { status: 'error', fieldErrors: { confirm: p.passwordMismatch }, error: p.passwordMismatch }
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'error', error: p.linkInvalid }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { status: 'error', error: error.message.includes('different') ? 'Choisissez un mot de passe différent de l’ancien.' : p.linkInvalid }
  return { status: 'success', message: p.passwordSaved }
}

/**
 * Changement de mot de passe depuis l'espace client : vérification du mot de passe actuel sur un
 * client Supabase sans cookies (la session en cours n'est pas remplacée), puis mise à jour avec la session.
 */
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const cp = p.changePassword
  const current = String(formData.get('current') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (!current) return { status: 'error', fieldErrors: { current: cp.currentRequired }, error: cp.currentRequired }
  if (password.length < 12) return { status: 'error', fieldErrors: { password: p.passwordShort }, error: p.passwordShort }
  if (password.length > 72) return { status: 'error', fieldErrors: { password: cp.failed }, error: cp.failed }
  if (password !== confirm) return { status: 'error', fieldErrors: { confirm: p.passwordMismatch }, error: p.passwordMismatch }
  if (password === current) return { status: 'error', fieldErrors: { password: cp.sameAsCurrent }, error: cp.sameAsCurrent }

  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/espace-client/connexion?next=%2Fespace-client%2Fmot-de-passe')
  const { data: account } = await supabase.from('client_accounts').select('client_id').eq('user_id', user.id).maybeSingle()
  if (!account) return { status: 'error', error: p.notClient }

  const verifier = createPublicClient()
  const { data: check, error: checkError } = await verifier.auth.signInWithPassword({ email: user.email, password: current })
  if (checkError || !check.session) return { status: 'error', fieldErrors: { current: cp.currentWrong }, error: cp.currentWrong }
  await verifier.auth.signOut({ scope: 'local' })

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    const msg = error.code === 'same_password' ? cp.sameAsCurrent : cp.failed
    return { status: 'error', error: msg }
  }
  return { status: 'success', message: cp.saved }
}
