import 'server-only'
import type { PostgrestError } from '@supabase/supabase-js'
import type { z } from 'zod'

/** État renvoyé par les Server Actions utilisées avec useActionState. */
export interface ActionState {
  ok: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Identifiant créé, pour un lien « ouvrir » après succès */
  id?: string
}

export const initialActionState: ActionState = { ok: false }

/** Les fonctions SQL lèvent des messages métier en français : on les relaie tels quels. */
export function fromDbError(error: PostgrestError | Error | null | undefined, fallback = 'Opération refusée'): ActionState {
  if (!error) return { ok: false, error: fallback }
  const msg = error.message || fallback
  if ('code' in error && error.code === '42501') return { ok: false, error: msg.startsWith('Accès refusé') ? msg : 'Accès refusé : droits insuffisants' }
  if ('code' in error && error.code === '23505') return { ok: false, error: 'Doublon : cet enregistrement existe déjà' }
  if ('code' in error && error.code === '23514') return { ok: false, error: `Contrôle refusé : ${msg}` }
  return { ok: false, error: msg }
}

export function fromZod(result: z.ZodSafeParseError<unknown>): ActionState {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { ok: false, error: 'Merci de corriger les champs signalés', fieldErrors }
}

/** FormData → objet simple (les champs vides deviennent undefined). */
export function formToObject(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('$ACTION')) continue
    if (typeof v === 'string') out[k] = v.trim() === '' ? undefined : v.trim()
  }
  return out
}
