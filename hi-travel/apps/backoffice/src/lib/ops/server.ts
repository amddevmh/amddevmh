import 'server-only'
import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/actions'

/**
 * Les écrans sont dynamiques (session) : après une mutation on invalide l’arbre
 * pour que toutes les listes (tableau de bord, écrans du jour, dossiers) restent cohérentes.
 */
export function refreshAll() {
  revalidatePath('/', 'layout')
}

export function ok(message: string, id?: string): ActionState {
  refreshAll()
  return { ok: true, message, id }
}

export function fail(error: string): ActionState {
  return { ok: false, error }
}

/** Une mise à jour filtrée par la RLS ne renvoie pas d’erreur : on vérifie qu’une ligne a bien été modifiée. */
export const NOT_ALLOWED = 'Modification refusée : droits insuffisants ou élément introuvable'

export function str(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t === '' ? undefined : t
}

export function bool(v: FormDataEntryValue | null): boolean {
  return v === 'on' || v === 'true' || v === '1'
}
