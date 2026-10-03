import 'server-only'
import { getStaffSession, type Module, type StaffSession } from '@/lib/auth'

/** Contrôle d'accès des exports : session collaborateur + droit « exporter » du module. */
export async function exportGuard(module: Module): Promise<StaffSession | Response> {
  const session = await getStaffSession()
  if (!session) return new Response('Authentification requise', { status: 401 })
  if (!session.can(module, 'export')) return new Response('Accès refusé : droit d’export requis', { status: 403 })
  return session
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}
