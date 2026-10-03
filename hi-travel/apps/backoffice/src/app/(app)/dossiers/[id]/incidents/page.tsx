import { formatDateTimeFr, formatMoney, label } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Textarea } from '@hi/ui'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { Disclosure, StaffSelect } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { saveIncident } from '@/lib/ops/actions/dossiers'
import { db, getStaff, getSupplierOptions } from '@/lib/ops/data'
import { getDossier } from '@/lib/ops/dossier'
import { isoToZonedLocal } from '@/lib/ops/format'
import { incidentKindLabels, incidentStatusLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Dossier — incidents et modifications' }

type Incident = { id: string; kind: string; title: string; description: string | null; supplier_id: string | null; owner_id: string | null; due_at: string | null; cost_impact: number | null; status: string; resolution: string | null; created_at: string }

function IncidentFields({ inc, staff, suppliers }: { inc?: Incident; staff: Array<{ id: string; full_name: string }>; suppliers: Array<{ id: string; name: string }> }) {
  const k = inc?.id ?? 'new'
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Field label="Nature" htmlFor={`ik-${k}`}><Select id={`ik-${k}`} name="kind" defaultValue={inc?.kind ?? 'incident'}>{Object.entries(incidentKindLabels).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</Select></Field>
      <Field label="Intitulé" htmlFor={`it-${k}`} required className="md:col-span-2"><Input id={`it-${k}`} name="title" defaultValue={inc?.title ?? ''} /></Field>
      <Field label="Description" htmlFor={`id-${k}`} className="md:col-span-3"><Textarea id={`id-${k}`} name="description" defaultValue={inc?.description ?? ''} className="min-h-14!" /></Field>
      <Field label="Fournisseur concerné" htmlFor={`is-${k}`}><Select id={`is-${k}`} name="supplier_id" defaultValue={inc?.supplier_id ?? ''}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      <Field label="Responsable" htmlFor={`io-${k}`}><StaffSelect staff={staff} name="owner_id" id={`io-${k}`} defaultValue={inc?.owner_id} /></Field>
      <Field label="Échéance" htmlFor={`idu-${k}`}><Input id={`idu-${k}`} name="due_at" type="datetime-local" defaultValue={isoToZonedLocal(inc?.due_at)} /></Field>
      <Field label="Impact financier (DT)" htmlFor={`ic-${k}`} hint="Frais, pénalités, avoir à prévoir"><Input id={`ic-${k}`} name="cost_impact" type="number" step="0.001" defaultValue={inc?.cost_impact ?? ''} /></Field>
      <Field label="État" htmlFor={`ist-${k}`}><Select id={`ist-${k}`} name="status" defaultValue={inc?.status ?? 'open'}>{Object.entries(incidentStatusLabels).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</Select></Field>
      <Field label="Résolution" htmlFor={`ir-${k}`} hint="Obligatoire pour résoudre ou clore"><Input id={`ir-${k}`} name="resolution" defaultValue={inc?.resolution ?? ''} /></Field>
    </div>
  )
}

export default async function IncidentsTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('dossiers')
  const { id } = await params
  await getDossier(id)
  const supabase = await db()
  const [{ data }, staff, suppliers] = await Promise.all([
    supabase.from('incidents').select('*').eq('dossier_id', id).order('created_at', { ascending: false }),
    getStaff(), getSupplierOptions(),
  ])
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const supNames = new Map(suppliers.map((s) => [s.id, s.name]))
  const canUpdate = session.can('dossiers', 'update')
  return (
    <div className="space-y-6">
      {canUpdate ? (
        <Disclosure summary="Déclarer un incident, une réclamation ou une modification">
          <OpsForm action={saveIncident} resetOnSuccess>
            <input type="hidden" name="dossier_id" value={id} />
            <IncidentFields staff={staff} suppliers={suppliers} />
            <OpsSubmit>Enregistrer</OpsSubmit>
          </OpsForm>
        </Disclosure>
      ) : null}
      <Card>
        <CardHeader title="Incidents, réclamations et modifications" description="Reliés au dossier et au fournisseur, avec responsable, échéance, coûts et résolution." />
        <CardBody>
          {data?.length ? (
            <ul className="space-y-3">
              {(data as Incident[]).map((i) => (
                <li key={i.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{i.title} <Badge>{label(incidentKindLabels, i.kind)}</Badge></p>
                    <Badge tone={i.status === 'open' ? 'warning' : i.status === 'in_progress' ? 'info' : 'success'}>{label(incidentStatusLabels, i.status)}</Badge>
                  </div>
                  <p className="text-xs text-muted">
                    Créé le {formatDateTimeFr(i.created_at)} · responsable {i.owner_id ? names.get(i.owner_id) : '—'} · échéance {formatDateTimeFr(i.due_at)}
                    {i.supplier_id ? ` · fournisseur ${supNames.get(i.supplier_id) ?? ''}` : ''}{i.cost_impact != null ? ` · impact ${formatMoney(i.cost_impact)}` : ''}
                  </p>
                  {i.description ? <p className="mt-1 text-sm">{i.description}</p> : null}
                  {i.resolution ? <p className="mt-1 text-sm text-success-600">Résolution : {i.resolution}</p> : null}
                  {canUpdate ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-brand-600">Mettre à jour</summary>
                      <OpsForm action={saveIncident} className="mt-2">
                        <input type="hidden" name="id" value={i.id} /><input type="hidden" name="dossier_id" value={id} />
                        <IncidentFields inc={i} staff={staff} suppliers={suppliers} />
                        <OpsSubmit size="sm" variant="secondary">Mettre à jour</OpsSubmit>
                      </OpsForm>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Aucun incident" />}
        </CardBody>
      </Card>
    </div>
  )
}
