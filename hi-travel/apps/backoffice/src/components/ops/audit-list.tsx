import { formatDateTimeFr } from '@hi/core'
import { Badge, EmptyState } from '@hi/ui'

interface AuditRow {
  id: number
  table_name: string
  action: string
  changed: unknown
  reason: string | null
  actor_id: string | null
  created_at: string
  new_values?: unknown
}

const TABLES: Record<string, string> = {
  dossiers: 'Dossier', services: 'Prestation', payment_schedule_items: 'Échéancier', tasks: 'Tâche', external_deadlines: 'Échéance',
  dossier_checks: 'Contrôle', dossier_travellers: 'Voyageur du dossier', visa_applications: 'Visa', clients: 'Client', travellers: 'Voyageur',
  traveller_identity_documents: 'Pièce d’identité', leads: 'Demande', quotes: 'Devis', quote_versions: 'Version de devis', quote_lines: 'Ligne de devis',
  alerts: 'Alerte', suppliers: 'Fournisseur', departures: 'Départ', hotel_rates: 'Tarif hôtel',
}
const ACTIONS: Record<string, string> = { insert: 'Création', update: 'Modification', delete: 'Suppression' }
const HIDDEN = new Set(['updated_at', 'created_at', 'id'])

function show(v: unknown): string {
  if (v == null) return '∅'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120)
  return String(v).slice(0, 120)
}

/** Historique : auteur, date, ancienne → nouvelle valeur et justification. */
export function AuditList({ rows, names }: { rows: AuditRow[]; names: Map<string, string> }) {
  if (!rows.length) return <EmptyState title="Aucun historique" />
  return (
    <ol className="space-y-3">
      {rows.map((r) => {
        const changed = (r.changed ?? {}) as Record<string, { old: unknown; new: unknown }>
        const entries = Object.entries(changed).filter(([k]) => !HIDDEN.has(k))
        return (
          <li key={r.id} className="rounded-lg border border-line p-3">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="tabular">{formatDateTimeFr(r.created_at)}</span>
              <Badge tone={r.action === 'delete' ? 'danger' : r.action === 'insert' ? 'success' : 'info'}>{ACTIONS[r.action] ?? r.action}</Badge>
              <span>{TABLES[r.table_name] ?? r.table_name}</span>
              <span>· {r.actor_id ? names.get(r.actor_id) ?? 'Collaborateur' : 'Système'}</span>
            </p>
            {entries.length ? (
              <ul className="mt-1 space-y-0.5 text-sm">
                {entries.map(([k, v]) => (
                  <li key={k}><span className="font-medium">{k}</span> : <span className="text-danger-700 line-through">{show(v.old)}</span> → <span className="text-success-600">{show(v.new)}</span></li>
                ))}
              </ul>
            ) : null}
            {r.reason ? <p className="mt-1 text-xs text-brand-700">Justification : {r.reason}</p> : null}
          </li>
        )
      })}
    </ol>
  )
}
