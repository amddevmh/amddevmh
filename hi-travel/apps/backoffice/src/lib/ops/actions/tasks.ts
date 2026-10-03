'use server'

import { z } from 'zod'
import type { Enums, TablesUpdate } from '@hi/db'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { zonedLocalToIso } from '@/lib/ops/format'
import { WAITING_STATUSES } from '@/lib/ops/labels'
import { bool, fail, NOT_ALLOWED, ok } from '@/lib/ops/server'

const taskSchema = z.object({
  title: z.string().min(3, 'Intitulé trop court'),
  description: z.string().optional(),
  dossier_id: z.guid().optional(),
  service_id: z.guid().optional(),
  assignee_id: z.guid().optional(),
  due_at: z.string().optional(),
  activity: z.string().optional(),
})

export async function createTask(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('tasks', 'create')
  const parsed = taskSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const supabase = await db()
  const { data, error } = await supabase.from('tasks').insert({
    title: v.title,
    description: v.description ?? null,
    dossier_id: v.dossier_id ?? null,
    service_id: v.service_id ?? null,
    assignee_id: v.assignee_id ?? null,
    due_at: zonedLocalToIso(v.due_at),
    activity: (v.activity as Enums<'activity'> | undefined) ?? null,
    financial_risk: bool(formData.get('financial_risk')),
    source: 'manual',
  }).select('id').single()
  if (error) return fromDbError(error)
  return ok('Tâche créée', data.id)
}

const statusSchema = z.object({
  id: z.guid(),
  status: z.enum(['todo', 'in_progress', 'waiting_client', 'waiting_supplier', 'blocked', 'done', 'cancelled']),
  waiting_reason: z.string().optional(),
  next_follow_up_at: z.string().optional(),
  completion_note: z.string().optional(),
})

/** Changement d’état : une attente exige un motif, « Terminée » exige le résultat obtenu (JOU04/JOU05). */
export async function updateTaskStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('tasks', 'read')
  const parsed = statusSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const waiting = (WAITING_STATUSES as readonly string[]).includes(v.status)
  if (waiting && !v.waiting_reason) {
    return { ok: false, error: 'Motif de l’attente ou du blocage obligatoire', fieldErrors: { waiting_reason: ['Motif obligatoire'] } }
  }
  if (v.status === 'done' && !v.completion_note) {
    return { ok: false, error: 'Indiquer le résultat ou le justificatif obtenu pour terminer la tâche', fieldErrors: { completion_note: ['Résultat obligatoire'] } }
  }
  const supabase = await db()
  const patch: TablesUpdate<'tasks'> = { status: v.status }
  if (waiting) {
    patch.waiting_reason = v.waiting_reason
    patch.next_follow_up_at = zonedLocalToIso(v.next_follow_up_at)
  }
  if (v.status === 'done') patch.completion_note = v.completion_note
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', v.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('État de la tâche mis à jour')
}

export async function reassignTask(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('tasks', 'update')
  const id = z.guid().safeParse(formData.get('id'))
  if (!id.success) return fail('Tâche inconnue')
  const assignee = String(formData.get('assignee_id') ?? '')
  const supabase = await db()
  const { data, error } = await supabase.from('tasks').update({ assignee_id: assignee || null }).eq('id', id.data).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok(assignee ? 'Tâche réaffectée' : 'Tâche remise dans la file à attribuer')
}

/** Priorité manuelle : conserve auteur (journal d’audit) et motif obligatoire (JOU05). */
export async function setManualPriority(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('tasks', 'update')
  const parsed = z.object({
    id: z.guid(),
    manual_priority: z.enum(['red', 'orange', 'planned']).optional(),
    manual_priority_reason: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (v.manual_priority && !v.manual_priority_reason) {
    return { ok: false, error: 'Motif de la priorité manuelle obligatoire', fieldErrors: { manual_priority_reason: ['Motif obligatoire'] } }
  }
  const supabase = await db()
  const { data, error } = await supabase.from('tasks').update({
    manual_priority: v.manual_priority ?? null,
    manual_priority_reason: v.manual_priority ? v.manual_priority_reason : null,
  }).eq('id', v.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok(v.manual_priority ? 'Priorité manuelle enregistrée' : 'Priorité calculée rétablie')
}

// ---------------------------------------------------------------------------
// Échéances externes (DEL01/DEL02) : jamais inventées
// ---------------------------------------------------------------------------

const deadlineSchema = z.object({
  dossier_id: z.guid('Dossier obligatoire'),
  service_id: z.guid().optional(),
  kind: z.enum(['ticket_issue', 'option_expiry', 'hotel_payment', 'supplier_payment', 'visa_appointment', 'rooming_list', 'other']),
  label: z.string().min(3, 'Libellé obligatoire'),
  due_at: z.string().optional(),
  timezone: z.string().default('Africa/Tunis'),
  source: z.enum(['supplier', 'api', 'report', 'manual']).optional(),
  source_note: z.string().optional(),
  assignee_id: z.guid().optional(),
})

export async function createDeadline(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('tasks', 'update')
  const parsed = deadlineSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const dueAt = zonedLocalToIso(v.due_at, v.timezone)
  if (dueAt && (!v.source || !v.source_note)) {
    return {
      ok: false,
      error: 'Une date contractuelle doit indiquer sa source et sa justification (e-mail, contrat, API…)',
      fieldErrors: { source: v.source ? undefined : ['Source obligatoire'], source_note: v.source_note ? undefined : ['Justification obligatoire'] },
    }
  }
  const supabase = await db()
  const { data, error } = await supabase.from('external_deadlines').insert({
    dossier_id: v.dossier_id,
    service_id: v.service_id ?? null,
    kind: v.kind,
    label: v.label,
    due_at: dueAt,
    timezone: v.timezone,
    source: dueAt ? v.source : (v.source ?? null),
    source_note: v.source_note ?? null,
    received_at: dueAt ? new Date().toISOString() : null,
  }).select('id').single()
  if (error) return fromDbError(error)

  if (!dueAt) {
    // DEL02 : date absente → tâche de collecte attribuée, sans date inventée
    const { data: dossier } = await supabase.from('dossiers').select('owner_id, reference').eq('id', v.dossier_id).maybeSingle()
    await supabase.from('tasks').insert({
      title: `Obtenir la date : ${v.label}`,
      description: `Délai fournisseur à compléter pour le dossier ${dossier?.reference ?? ''}. Ne pas estimer la date : la saisir avec sa source.`,
      dossier_id: v.dossier_id,
      service_id: v.service_id ?? null,
      deadline_id: data.id,
      assignee_id: v.assignee_id ?? dossier?.owner_id ?? null,
      financial_risk: ['hotel_payment', 'supplier_payment', 'option_expiry', 'ticket_issue'].includes(v.kind),
      source: 'collect_deadline',
      dedupe_key: `collect-deadline:${data.id}`,
    })
    return ok('Échéance créée : « délai à compléter », tâche de collecte attribuée', data.id)
  }
  return ok('Échéance contractuelle enregistrée', data.id)
}

const completeDeadlineSchema = z.object({
  id: z.guid(),
  due_at: z.string().min(1, 'Date obligatoire'),
  timezone: z.string().default('Africa/Tunis'),
  source: z.enum(['supplier', 'api', 'report', 'manual'], 'Source obligatoire'),
  source_note: z.string().min(3, 'Justification obligatoire'),
})

/** Saisie de la date contractuelle avec sa source ; la tâche de collecte est soldée avec ce résultat. */
export async function completeDeadline(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('tasks', 'update')
  const parsed = completeDeadlineSchema.safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  const dueAt = zonedLocalToIso(v.due_at, v.timezone)
  const supabase = await db()
  const { data, error } = await supabase.from('external_deadlines').update({
    due_at: dueAt, timezone: v.timezone, source: v.source, source_note: v.source_note,
    received_at: new Date().toISOString(), needs_recheck: false,
  }).eq('id', v.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  await supabase.from('tasks')
    .update({ status: 'done', completion_note: `Date contractuelle saisie (${v.source}) : ${v.source_note}` })
    .eq('deadline_id', v.id).eq('source', 'collect_deadline').not('status', 'in', '(done,cancelled)')
  return ok('Date contractuelle enregistrée')
}

export async function setDeadlineStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('tasks', 'update')
  const parsed = z.object({ id: z.guid(), status: z.enum(['open', 'met', 'missed', 'cancelled']) }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await db()
  const { data, error } = await supabase.from('external_deadlines')
    .update({ status: parsed.data.status, needs_recheck: false }).eq('id', parsed.data.id).select('id')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  return ok('Échéance mise à jour')
}
