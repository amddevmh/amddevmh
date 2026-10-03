import { formatDateTimeFr, label } from '@hi/core'
import { EmptyState, Input, Select } from '@hi/ui'
import { addInteraction } from '@/lib/ops/actions/crm'
import { channelLabels } from '@/lib/ops/labels'
import { OpsForm, OpsSubmit } from './ops-form'

interface Row { id: string; channel: string; direction: string | null; summary: string; author_id: string | null; occurred_at: string }

/** Journal des échanges consignés (client, demande ou dossier). */
export function InteractionsList({ rows, names, target, canAdd }: {
  rows: Row[]; names: Map<string, string>; target: { client_id?: string | null; lead_id?: string | null; dossier_id?: string | null }; canAdd: boolean
}) {
  return (
    <div className="space-y-4">
      {canAdd ? (
        <OpsForm action={addInteraction} resetOnSuccess>
          {target.client_id ? <input type="hidden" name="client_id" value={target.client_id} /> : null}
          {target.lead_id ? <input type="hidden" name="lead_id" value={target.lead_id} /> : null}
          {target.dossier_id ? <input type="hidden" name="dossier_id" value={target.dossier_id} /> : null}
          <div className="flex flex-wrap gap-2">
            <Select name="channel" defaultValue="phone" className="w-auto!" aria-label="Canal">
              {Object.entries(channelLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select name="direction" defaultValue="out" className="w-auto!" aria-label="Sens">
              <option value="out">Sortant</option><option value="in">Entrant</option>
            </Select>
            <Input name="summary" placeholder="Résumé de l’échange" className="min-w-60 flex-1" aria-label="Résumé" />
            <OpsSubmit variant="secondary">Consigner</OpsSubmit>
          </div>
        </OpsForm>
      ) : null}
      {rows.length ? (
        <ol className="space-y-3 border-l-2 border-line pl-4">
          {rows.map((r) => (
            <li key={r.id}>
              <p className="text-xs text-muted">
                {formatDateTimeFr(r.occurred_at)} · {label(channelLabels, r.channel)}{r.direction ? (r.direction === 'in' ? ' entrant' : ' sortant') : ''} · {r.author_id ? names.get(r.author_id) ?? '—' : 'Système'}
              </p>
              <p className="text-sm">{r.summary}</p>
            </li>
          ))}
        </ol>
      ) : <EmptyState title="Aucun échange consigné" />}
    </div>
  )
}
