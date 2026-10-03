import Link from 'next/link'
import { activityLabels, formatDateFr, formatDateTimeFr, label, taskStatusLabels } from '@hi/core'
import type { Views } from '@hi/db'
import { EmptyState, Input, Select, StatusBadge, Table, Td, Th } from '@hi/ui'
import { OpsForm as ActionForm, OpsSubmit as SubmitButton } from './ops-form'
import { reassignTask, setManualPriority } from '@/lib/ops/actions/tasks'
import { PriorityBadge, StaffSelect, TimeLeft } from './ui'
import { TaskStatusForm } from './task-status-form'

export type TaskRow = Views<'task_board'>

/**
 * Tableau des tâches (JOU01) : dossier, client, prestation, action attendue, responsable,
 * échéance, temps restant, priorité expliquée, état et lien vers la pièce utile.
 */
export function TaskTable({ tasks, staff, services, canReassign, userId, showDossier = true, emptyTitle = 'Aucune tâche' }: {
  tasks: TaskRow[]
  staff: Array<{ id: string; full_name: string; active?: boolean }>
  services: Map<string, string>
  canReassign: boolean
  userId: string
  showDossier?: boolean
  emptyTitle?: string
}) {
  if (!tasks.length) return <EmptyState title={emptyTitle} description="Rien à traiter avec ces critères." />
  return (
    <Table className="-mx-5">
      <thead>
        <tr>
          <Th>Priorité</Th>
          {showDossier ? <Th>Dossier / client</Th> : null}
          <Th>Action attendue</Th>
          <Th>Responsable</Th>
          <Th>Échéance</Th>
          <Th className="min-w-56">État</Th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => {
          const canEdit = canReassign || t.assignee_id === userId
          const service = t.service_id ? services.get(t.service_id) : null
          return (
            <tr key={t.id} className={t.priority === 'red' ? 'bg-danger-50/40' : undefined}>
              <Td className="w-40"><PriorityBadge level={t.priority} reason={t.priority_reason} /></Td>
              {showDossier ? (
                <Td>
                  {t.dossier_id ? (
                    <>
                      <Link href={`/dossiers/${t.dossier_id}`} className="font-medium text-brand-600 hover:underline">{t.dossier_reference}</Link>
                      <p className="text-xs text-muted">{t.client_name}</p>
                      {t.dossier_start_date ? <p className="text-xs text-muted">Départ {formatDateFr(t.dossier_start_date)}</p> : null}
                    </>
                  ) : <span className="text-xs text-muted">Hors dossier</span>}
                </Td>
              ) : null}
              <Td>
                <p className="font-medium text-ink">{t.title}</p>
                {service ? (
                  <p className="text-xs text-muted">
                    Prestation : <Link className="hover:underline" href={`/dossiers/${t.dossier_id}/prestations/${t.service_id}`}>{service}</Link>
                  </p>
                ) : null}
                {t.activity ? <p className="text-xs text-muted">{label(activityLabels, t.activity)}</p> : null}
                {t.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.description}</p> : null}
                {t.waiting_reason && ['waiting_client', 'waiting_supplier', 'blocked'].includes(t.status ?? '') ? (
                  <p className="mt-1 text-xs text-warning-600">Motif : {t.waiting_reason}{t.next_follow_up_at ? ` — relance ${formatDateTimeFr(t.next_follow_up_at)}` : ''}</p>
                ) : null}
                {t.status === 'done' && t.completion_note ? <p className="mt-1 text-xs text-success-600">Résultat : {t.completion_note}</p> : null}
                {canReassign && t.status !== 'done' && t.status !== 'cancelled' ? (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-brand-600">Priorité manuelle…</summary>
                    <ActionForm action={setManualPriority} className="mt-2">
                      <input type="hidden" name="id" value={t.id ?? ''} />
                      <div className="flex flex-wrap gap-2">
                        <Select name="manual_priority" defaultValue={t.manual_priority ?? ''} className="h-8! w-auto! text-xs!" aria-label="Priorité manuelle">
                          <option value="">Calculée (règles)</option>
                          <option value="red">Urgent</option>
                          <option value="orange">Aujourd’hui</option>
                          <option value="planned">Planifié</option>
                        </Select>
                        <Input name="manual_priority_reason" defaultValue={t.manual_priority_reason ?? ''} placeholder="Motif (obligatoire)" className="h-8! w-48! text-xs!" aria-label="Motif" />
                        <SubmitButton size="sm" variant="secondary">OK</SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                ) : null}
              </Td>
              <Td className="min-w-56">
                {canReassign && t.status !== 'done' ? (
                  <ActionForm action={reassignTask}>
                    <input type="hidden" name="id" value={t.id ?? ''} />
                    <div className="flex items-center gap-1">
                      <StaffSelect staff={staff} name="assignee_id" id={`assignee-${t.id}`} defaultValue={t.assignee_id} />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…">OK</SubmitButton>
                    </div>
                  </ActionForm>
                ) : (
                  <span className={t.assignee_name ? '' : 'font-medium text-warning-600'}>{t.assignee_name ?? 'Non attribuée'}</span>
                )}
              </Td>
              <Td className="whitespace-nowrap">
                <p>{t.due_at ? formatDateTimeFr(t.due_at) : <span className="text-muted">—</span>}</p>
                {t.status !== 'done' && t.status !== 'cancelled' ? <TimeLeft dueAt={t.due_at} /> : null}
              </Td>
              <Td>
                {canEdit ? (
                  <TaskStatusForm taskId={t.id ?? ''} status={t.status ?? 'todo'} waitingReason={t.waiting_reason} compact />
                ) : (
                  <StatusBadge status={t.status} labels={taskStatusLabels} />
                )}
              </Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}
