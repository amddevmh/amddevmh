import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@hi/db/server'
import type { Enums, Tables } from '@hi/db'

export type PermAction = Enums<'perm_action'>
export type Module =
  | 'crm' | 'quotes' | 'dossiers' | 'departures' | 'suppliers' | 'finance' | 'accounting' | 'documents'
  | 'identity' | 'tasks' | 'site' | 'reports' | 'settings' | 'imports' | 'integrations' | 'margins'

export interface StaffSession {
  userId: string
  email: string
  profile: Tables<'staff_profiles'>
  permissions: Set<string>
  can: (module: Module, action?: PermAction) => boolean
}

/**
 * Session collaborateur, mise en cache pour la requête.
 * Les droits affichés ici ne servent qu'à l'interface : chaque action reste contrôlée côté serveur
 * par la RLS et les fonctions SQL (require_perm).
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('staff_profiles').select('*').eq('id', user.id).maybeSingle()
  if (!profile || !profile.active) return null
  const { data: perms } = await supabase.from('role_permissions').select('module, action').eq('role', profile.role)
  const permissions = new Set((perms ?? []).map((p) => `${p.module}:${p.action}`))
  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    permissions,
    can: (module, action = 'read') => permissions.has(`${module}:${action}`),
  }
})

/** À appeler en tête de page ou d'action : redirige vers la connexion ou refuse l'accès. */
export async function requireStaff(module?: Module, action: PermAction = 'read'): Promise<StaffSession> {
  const session = await getStaffSession()
  if (!session) redirect('/login')
  if (module && !session.can(module, action)) redirect('/acces-refuse')
  return session
}
