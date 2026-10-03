'use server'

import { z } from 'zod'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { fail, ok } from '@/lib/ops/server'

/** File d’anomalies : À examiner → Justifiée (motif obligatoire) / Corrigée / Résolue. Jamais supprimée. */
export async function updateAlert(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff()
  if (!session.can('dossiers', 'update') && !session.can('finance', 'update')) return fail('Accès refusé : traitement des alertes non autorisé')
  const parsed = z.object({
    id: z.guid(),
    status: z.enum(['to_review', 'justified', 'corrected', 'resolved']),
    resolution_note: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.status === 'justified' && !v.resolution_note) {
    return { ok: false, error: 'Une alerte justifiée exige un motif', fieldErrors: { resolution_note: ['Motif obligatoire'] } }
  }
  if ((v.status === 'corrected' || v.status === 'resolved') && !v.resolution_note) {
    return { ok: false, error: 'Décrire la correction ou la résolution', fieldErrors: { resolution_note: ['Obligatoire'] } }
  }
  const supabase = await db()
  const { data, error } = await supabase.from('alerts').update({
    status: v.status,
    resolution_note: v.resolution_note ?? null,
    resolved_by: v.status === 'to_review' ? null : session.userId,
  }).eq('id', v.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail('Alerte introuvable ou modification refusée')
  return ok('Alerte mise à jour')
}
