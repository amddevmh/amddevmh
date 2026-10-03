import Link from 'next/link'
import { alertStatusLabels, formatDateTimeFr, label } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, Select, StatusBadge } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { updateAlert } from '@/lib/ops/actions/alerts'
import { db, getStaff, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'
import { alertSeverityLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Rapprochements et alertes' }

const KIND_LABELS: Record<string, string> = {
  closed_with_exception: 'Clôture avec exception',
  post_closing_document: 'Pièce après clôture',
}

function renderDetails(details: unknown) {
  if (!details || typeof details !== 'object') return null
  const entries = Object.entries(details as Record<string, unknown>)
  if (!entries.length) return null
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted">
      {entries.map(([k, v]) => <li key={k}><span className="font-medium">{k}</span> : {Array.isArray(v) ? v.join(' · ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>)}
    </ul>
  )
}

export default async function AlertsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff()
  if (!session.can('dossiers') && !session.can('finance')) {
    return <PageHeader title="Rapprochements et alertes" description="Accès réservé aux profils dossiers ou finance." />
  }
  const params = await searchParams
  const status = sp(params, 'statut') ?? 'to_review'
  const severity = sp(params, 'gravite')
  const dossierQ = sp(params, 'dossier')
  const supabase = await db()
  let dossierIds: string[] | null = null
  if (dossierQ) {
    const { data } = await supabase.from('dossiers').select('id').ilike('reference', ilikeValue(dossierQ)).limit(50)
    dossierIds = (data ?? []).map((d) => d.id)
  }
  let q = supabase.from('alerts').select('*, dossiers(id, reference), services(id, description)')
  if (status !== 'toutes') q = q.eq('status', status)
  if (severity) q = q.eq('severity', severity)
  if (dossierIds) q = q.in('dossier_id', dossierIds.length ? dossierIds : ['00000000-0000-0000-0000-000000000000'])
  const [{ data, error }, staff] = await Promise.all([q.order('created_at', { ascending: false }).limit(300), getStaff()])
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const rank = { red: 0, orange: 1, info: 2 } as Record<string, number>
  const rows = (data ?? []).sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
  const canAct = session.can('dossiers', 'update') || session.can('finance', 'update')

  return (
    <>
      <PageHeader title="Rapprochements et alertes" description="File d’anomalies (phase 1 : traitement manuel). Une alerte n’est jamais supprimée : elle est justifiée, corrigée ou résolue, avec motif et auteur." />
      <FilterBar action="/alertes">
        <FilterField label="Statut">
          <Select name="statut" defaultValue={status}>
            <option value="toutes">Tous</option>
            {Object.entries(alertStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Gravité">
          <Select name="gravite" defaultValue={severity ?? ''}><option value="">Toutes</option>{Object.entries(alertSeverityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </FilterField>
        <FilterField label="Dossier"><FilterInput name="dossier" defaultValue={dossierQ} placeholder="DOS-2026-…" /></FilterField>
        <ResetLink href="/alertes" />
      </FilterBar>
      <Card>
        <CardHeader title={`${rows.length} alerte(s)`} description={error ? `Erreur : ${error.message}` : undefined} />
        <CardBody>
          {!rows.length ? <EmptyState title="Aucune alerte" description="Aucune anomalie avec ces critères." /> : (
            <ul className="space-y-3">
              {rows.map((a) => {
                const d = a.dossiers as { id: string; reference: string } | null
                const s = a.services as { id: string; description: string } | null
                return (
                  <li key={a.id} className={`rounded-lg border p-3 ${a.severity === 'red' ? 'border-danger-600/40 bg-danger-50/40' : 'border-line'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="text-xs text-muted">
                          {formatDateTimeFr(a.created_at)} · {KIND_LABELS[a.kind] ?? a.kind}
                          {d ? <> · <Link className="text-brand-600 hover:underline" href={`/dossiers/${d.id}`}>{d.reference}</Link></> : null}
                          {s && d ? <> · <Link className="text-brand-600 hover:underline" href={`/dossiers/${d.id}/prestations/${s.id}`}>{s.description}</Link></> : null}
                          {a.owner_id ? ` · ${names.get(a.owner_id)}` : ''}
                        </p>
                        {renderDetails(a.details)}
                      </div>
                      <span className="flex gap-2">
                        <Badge tone={a.severity === 'red' ? 'danger' : a.severity === 'orange' ? 'warning' : 'info'}>{label(alertSeverityLabels, a.severity)}</Badge>
                        <StatusBadge status={a.status} labels={alertStatusLabels} />
                      </span>
                    </div>
                    {a.resolution_note ? <p className="mt-1 text-sm text-brand-700">Motif / résolution : {a.resolution_note}{a.resolved_by ? ` — ${names.get(a.resolved_by) ?? ''}` : ''}</p> : null}
                    {canAct ? (
                      <OpsForm action={updateAlert} inline className="mt-2">
                        <input type="hidden" name="id" value={a.id} />
                        <div className="flex flex-wrap gap-2">
                          <Select name="status" defaultValue={a.status === 'to_review' ? 'justified' : a.status} className="h-8! w-auto! text-xs!" aria-label="Nouveau statut">
                            {Object.entries(alertStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </Select>
                          <Input name="resolution_note" defaultValue={a.resolution_note ?? ''} placeholder="Motif (obligatoire pour justifier) / correction effectuée" className="h-8! min-w-64 flex-1 text-xs!" aria-label="Motif" />
                          <OpsSubmit size="sm" variant="secondary">Enregistrer</OpsSubmit>
                        </div>
                      </OpsForm>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  )
}
