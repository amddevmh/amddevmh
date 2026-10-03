'use server'

import { z } from 'zod'
import { createClient } from '@hi/db/server'
import { requireStaff } from '@/lib/auth'
import { fromZod, formToObject, type ActionState } from '@/lib/actions'
import { authErrorMessage, PASSWORD_MIN, verifyPassword } from '@/lib/password'

const schema = z.object({
  current_password: z.string({ error: 'Mot de passe actuel requis' }).min(1, 'Mot de passe actuel requis'),
  new_password: z.string({ error: 'Nouveau mot de passe requis' }).min(PASSWORD_MIN, `Nouveau mot de passe : ${PASSWORD_MIN} caractères minimum`).max(72, '72 caractères maximum'),
  confirm_password: z.string({ error: 'Confirmation requise' }),
})

/**
 * Changement de son propre mot de passe : le mot de passe actuel est vérifié sur un client
 * Supabase sans cookies (la session en cours n’est pas remplacée), puis le nouveau est
 * enregistré avec la session de l’utilisateur.
 */
export async function changeOwnPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff()
  const parsed = schema.safeParse(formToObject(formData))
  if (!parsed.success) return { ...fromZod(parsed), error: parsed.error.issues[0]?.message ?? 'Saisie invalide' }
  const v = parsed.data
  if (v.new_password !== v.confirm_password) {
    return { ok: false, error: 'La confirmation ne correspond pas au nouveau mot de passe', fieldErrors: { confirm_password: ['Différent du nouveau mot de passe'] } }
  }
  if (v.new_password === v.current_password) {
    return { ok: false, error: 'Le nouveau mot de passe doit être différent de l’actuel', fieldErrors: { new_password: ['Identique à l’actuel'] } }
  }
  if (!(await verifyPassword(session.email, v.current_password))) {
    return { ok: false, error: 'Mot de passe actuel incorrect', fieldErrors: { current_password: ['Mot de passe incorrect'] } }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: v.new_password })
  if (error) return { ok: false, error: authErrorMessage(error, 'Changement de mot de passe impossible') }
  return { ok: true, message: 'Mot de passe modifié. Utilisez-le dès votre prochaine connexion.' }
}
