import 'server-only'
import { createClient as createSupabaseClient, type AuthError } from '@supabase/supabase-js'
import type { createAdminClient } from '@hi/db/admin'
import { supabaseEnv } from '@hi/db'
import type { ActionState } from '@/lib/actions'

/** Règle commune aux mots de passe saisis ou générés depuis le back office. */
export const PASSWORD_MIN = 12

/**
 * État d’une action qui fixe un mot de passe : celui-ci est renvoyé UNE fois pour être
 * affiché au collaborateur (jamais stocké ni journalisé). `issuedAt` permet à l’écran
 * d’afficher le plus récent quand plusieurs formulaires coexistent.
 */
export interface PasswordActionState extends ActionState {
  password?: string
  email?: string
  issuedAt?: number
}

/**
 * Vérifie un mot de passe sans toucher à la session en cours : client Supabase dédié,
 * sans cookies ni persistance. La session ouverte pour la vérification est aussitôt fermée.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const { url, anonKey } = supabaseEnv()
  const verifier = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await verifier.auth.signInWithPassword({ email, password })
  if (error || !data.session) return false
  await verifier.auth.signOut({ scope: 'local' })
  return true
}

/** Recherche d’un compte d’authentification par e-mail (clé service : appeler après le contrôle des droits). */
export async function findAuthUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const found = data.users.find((u) => u.email?.toLowerCase() === target)
    if (found) return found.id
    if (data.users.length < 1000) return null
  }
  return null
}

/** Messages d’erreur d’authentification en français. */
export function authErrorMessage(error: AuthError | null | undefined, fallback = 'Opération refusée par le service d’authentification'): string {
  switch (error?.code) {
    case 'same_password': return 'Le nouveau mot de passe doit être différent de l’actuel'
    case 'weak_password': return 'Mot de passe trop faible : choisissez-en un plus long ou plus varié'
    case 'email_exists':
    case 'user_already_exists': return 'Un compte existe déjà avec cet e-mail'
    case 'user_not_found': return 'Compte d’authentification introuvable'
    case 'email_address_invalid': return 'Adresse e-mail refusée par le service d’authentification'
    default: return error?.message ? `${fallback} (${error.message})` : fallback
  }
}
