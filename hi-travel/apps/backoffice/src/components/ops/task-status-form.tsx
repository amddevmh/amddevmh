'use client'

import { useState } from 'react'
import { taskStatusLabels } from '@hi/core'
import { Input, Select, Textarea } from '@hi/ui'
import { updateTaskStatus } from '@/lib/ops/actions/tasks'
import { OpsForm, OpsSubmit } from './ops-form'

const WAITING = ['waiting_client', 'waiting_supplier', 'blocked']
const STATUSES = ['todo', 'in_progress', 'waiting_client', 'waiting_supplier', 'blocked', 'done', 'cancelled']

/**
 * Changement d’état d’une tâche : les attentes demandent un motif (et une relance),
 * « Terminée » demande le résultat ou justificatif obtenu.
 */
export function TaskStatusForm({ taskId, status, waitingReason, compact = false }: {
  taskId: string; status: string; waitingReason?: string | null; compact?: boolean
}) {
  const [next, setNext] = useState(status)
  const waiting = WAITING.includes(next)
  return (
    <OpsForm action={updateTaskStatus} inline>
      <input type="hidden" name="id" value={taskId} />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="status" value={next} onChange={(e) => setNext(e.target.value)} aria-label="État" className={compact ? 'h-8! w-auto! text-xs!' : 'w-auto!'}>
          {STATUSES.map((s) => <option key={s} value={s}>{taskStatusLabels[s]}</option>)}
        </Select>
        <OpsSubmit size="sm" variant="secondary" pendingLabel="…">Appliquer</OpsSubmit>
      </div>
      {waiting ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="waiting_reason" placeholder="Motif de l’attente (obligatoire)" defaultValue={waitingReason ?? ''} aria-label="Motif de l’attente" className="h-8! text-xs!" />
          <Input name="next_follow_up_at" type="datetime-local" aria-label="Prochaine relance" title="Prochaine relance" className="h-8! text-xs!" />
        </div>
      ) : null}
      {next === 'done' && status !== 'done' ? (
        <Textarea name="completion_note" placeholder="Résultat obtenu / justificatif (obligatoire)" aria-label="Résultat obtenu" className="min-h-14! text-xs!" />
      ) : null}
    </OpsForm>
  )
}
