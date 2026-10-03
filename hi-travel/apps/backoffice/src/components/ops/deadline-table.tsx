import Link from 'next/link'
import { formatDateTimeFr, label } from '@hi/core'
import { Badge, EmptyState, Input, Select, Table, Td, Th } from '@hi/ui'
import { OpsForm as ActionForm, OpsSubmit as SubmitButton } from './ops-form'
import { completeDeadline, setDeadlineStatus } from '@/lib/ops/actions/tasks'
import { formatInZone } from '@/lib/ops/format'
import { deadlineKindLabels, deadlineSourceLabels, deadlineStatusLabels } from '@/lib/ops/labels'
import { LabelSelect, TimeLeft } from './ui'

export interface DeadlineRow {
  id: string
  kind: string
  label: string
  due_at: string | null
  timezone: string
  source: string | null
  source_note: string | null
  received_at: string | null
  needs_recheck: boolean
  status: string
  dossier_id: string
  service_id: string | null
  dossiers?: { reference: string; title: string } | null
  services?: { description: string } | null
}

/** Échéances externes : une date absente s’affiche « délai à compléter », jamais estimée. */
export function DeadlineTable({ rows, canUpdate, showDossier = true }: { rows: DeadlineRow[]; canUpdate: boolean; showDossier?: boolean }) {
  if (!rows.length) return <EmptyState title="Aucune échéance" description="Aucune échéance fournisseur avec ces critères." />
  return (
    <Table className="-mx-5">
      <thead>
        <tr>
          {showDossier ? <Th>Dossier</Th> : null}
          <Th>Échéance</Th>
          <Th>Date limite</Th>
          <Th>Source</Th>
          <Th>État</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id} className={!d.due_at && d.status === 'open' ? 'bg-warning-50/50' : undefined}>
            {showDossier ? (
              <Td>
                <Link className="font-medium text-brand-600 hover:underline" href={`/dossiers/${d.dossier_id}/echeances`}>{d.dossiers?.reference ?? 'Dossier'}</Link>
                <p className="text-xs text-muted">{d.dossiers?.title}</p>
              </Td>
            ) : null}
            <Td>
              <p className="font-medium">{d.label}</p>
              <p className="text-xs text-muted">{label(deadlineKindLabels, d.kind)}{d.services ? ` — ${d.services.description}` : ''}</p>
              {d.needs_recheck ? <Badge tone="warning" className="mt-1">À revérifier (prestation modifiée)</Badge> : null}
            </Td>
            <Td className="min-w-56">
              {d.due_at ? (
                <>
                  <p className="whitespace-nowrap">{formatInZone(d.due_at, d.timezone)}</p>
                  {d.status === 'open' ? <TimeLeft dueAt={d.due_at} /> : null}
                </>
              ) : (
                <>
                  <Badge tone="warning">Délai à compléter</Badge>
                  {canUpdate && d.status === 'open' ? (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-brand-600">Saisir la date reçue…</summary>
                      <ActionForm action={completeDeadline} className="mt-2">
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="timezone" value={d.timezone} />
                        <div className="grid gap-2">
                          <Input type="datetime-local" name="due_at" required aria-label="Date limite" className="h-8! text-xs!" />
                          <LabelSelect labels={deadlineSourceLabels} name="source" id={`src-${d.id}`} emptyLabel="Source…" required />
                          <Input name="source_note" required placeholder="Justification (e-mail, contrat…)" className="h-8! text-xs!" />
                          <SubmitButton size="sm">Enregistrer</SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                  ) : null}
                </>
              )}
            </Td>
            <Td>
              {d.source ? (
                <>
                  <p>{label(deadlineSourceLabels, d.source)}</p>
                  {d.source_note ? <p className="text-xs text-muted">{d.source_note}</p> : null}
                  {d.received_at ? <p className="text-xs text-muted">Reçue le {formatDateTimeFr(d.received_at)}</p> : null}
                </>
              ) : <span className="text-xs text-muted">—</span>}
            </Td>
            <Td className="min-w-44">
              {canUpdate ? (
                <ActionForm action={setDeadlineStatus}>
                  <input type="hidden" name="id" value={d.id} />
                  <div className="flex items-center gap-1">
                    <Select name="status" defaultValue={d.status} className="h-8! w-auto! text-xs!" aria-label="État de l’échéance">
                      {Object.entries(deadlineStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    <SubmitButton size="sm" variant="ghost" pendingLabel="…">OK</SubmitButton>
                  </div>
                </ActionForm>
              ) : label(deadlineStatusLabels, d.status)}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
