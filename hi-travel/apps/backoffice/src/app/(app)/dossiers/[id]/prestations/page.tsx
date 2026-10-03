import Link from 'next/link'
import { ACTIVITIES, activityLabels, boardLabels, formatDateFr, formatDateTimeFr, label, serviceStatusLabels, serviceTypeLabels, type Activity } from '@hi/core'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Input, Money, StatusBadge, buttonClass } from '@hi/ui'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { ServiceStatusForm } from '@/components/ops/service-status-form'
import { TimeLeft } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { acknowledgeReview } from '@/lib/ops/actions/dossiers'
import { db } from '@/lib/ops/data'
import { getDossier, getDossierServices } from '@/lib/ops/dossier'
import { detail, formatInZone } from '@/lib/ops/format'

export const metadata = { title: 'Dossier — prestations' }

export default async function ServicesTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('dossiers')
  const { id } = await params
  const d = await getDossier(id)
  const services = await getDossierServices(id)
  const supabase = await db()
  const { data: docs } = session.can('documents') ? await supabase.from('documents').select('id, title').eq('dossier_id', id).order('created_at', { ascending: false }) : { data: [] }
  const canUpdate = session.can('dossiers', 'update')
  const canMargins = session.can('margins')
  const docTitles = new Map((docs ?? []).map((x) => [x.id, x.title]))
  const byService = new Map(services.map((s) => [s.id, s]))
  const groups = ACTIVITIES.map((a) => ({ a, items: services.filter((s) => s.activity === a) })).filter((g) => g.items.length)
  const tripNights = d.start_date && d.end_date ? Math.round((Date.parse(d.end_date) - Date.parse(d.start_date)) / 86400000) : null

  return (
    <div className="space-y-6">
      {canUpdate ? (
        <Card>
          <CardHeader title="Ajouter une prestation" description="Chaque prestation garde son module d’origine, son fournisseur, ses dates, son coût et son propre statut." />
          <CardBody className="flex flex-wrap gap-2">
            {ACTIVITIES.map((a) => <Link key={a} href={`/dossiers/${id}/prestations/nouvelle?module=${a}`} className={buttonClass('secondary', 'sm')}>+ {activityLabels[a]}</Link>)}
          </CardBody>
        </Card>
      ) : null}
      {services.length === 0 ? <Card><EmptyState title="Aucune prestation" description="Ajoutez les prestations par module métier." /></Card> : null}
      {groups.map((g) => (
        <section key={g.a}>
          <h2 className="mb-2 font-display text-base font-semibold text-brand-900">{activityLabels[g.a as Activity]} <span className="text-sm font-normal text-muted">({g.items.length})</span></h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {g.items.map((s) => {
              const linked = s.linked_service_id ? byService.get(s.linked_service_id) : null
              const proof = s.confirmation_document_id ? docTitles.get(s.confirmation_document_id) : null
              return (
                <Card key={s.id} className={s.needs_review ? 'ring-2 ring-danger-600/40' : s.status === 'cancelled' ? 'opacity-60' : undefined}>
                  <CardBody className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted">{label(serviceTypeLabels, s.service_type)}{s.is_mandatory ? ' · obligatoire' : ' · facultative'}{s.suppliers ? ` · ${(s.suppliers as { name: string }).name}` : ' · fournisseur à préciser'}</p>
                        <Link href={`/dossiers/${id}/prestations/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.description}</Link>
                      </div>
                      <StatusBadge status={s.status} labels={serviceStatusLabels} />
                    </div>
                    <div className="grid gap-1 text-sm sm:grid-cols-2">
                      {s.service_type === 'hotel' ? (
                        <>
                          <p>{(s.hotels as { name?: string } | null)?.name ?? 'Hôtel à préciser'}{s.room_type ? ` — ${s.room_type}` : ''}</p>
                          <p>{s.board ? `${s.board} (${label(boardLabels, s.board)})` : 'Pension à préciser'}{s.occupancy ? ` · ${s.occupancy}` : ''}</p>
                          <p>{formatDateFr(s.start_date)} → {formatDateFr(s.end_date)}</p>
                          <p><strong>{s.nights ?? '—'} nuitée(s)</strong>{tripNights != null ? <span className="text-xs text-muted"> (voyage : {tripNights} nuit(s))</span> : null}</p>
                        </>
                      ) : s.start_at ? (
                        <p className="sm:col-span-2">{formatInZone(s.start_at, s.local_timezone)}{s.end_at ? ` → ${formatInZone(s.end_at, s.local_timezone)}` : ''}</p>
                      ) : (
                        <p className="sm:col-span-2">{s.start_date ? `${formatDateFr(s.start_date)}${s.end_date && s.end_date !== s.start_date ? ` → ${formatDateFr(s.end_date)}` : ''}` : 'Dates à préciser'}</p>
                      )}
                      {['transfer', 'transport'].includes(s.service_type) ? (
                        <p className="sm:col-span-2 text-xs text-muted">{[detail(s.details, 'pickup') && `Prise en charge : ${detail(s.details, 'pickup')}`, detail(s.details, 'vehicle') && `Véhicule : ${detail(s.details, 'vehicle')}`, detail(s.details, 'driver') && `Chauffeur : ${detail(s.details, 'driver')}`, detail(s.details, 'pax_count') && `${detail(s.details, 'pax_count')} pax`].filter(Boolean).join(' · ') || 'Prise en charge, véhicule et chauffeur à compléter'}</p>
                      ) : null}
                      {linked ? <p className="sm:col-span-2 text-xs text-muted">Liée à : {linked.description}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span>Vente <Money value={s.sale_price} /></span>
                      {canMargins ? <span className="text-muted">Coût <Money value={s.cost_confirmed ?? s.cost_planned} currency={s.cost_currency} />{s.cost_currency !== 'TND' ? ` × ${s.fx_rate}` : ''}{s.cost_confirmed == null ? ' (prévu)' : ' (confirmé)'}{Number(s.cost_confirmed ?? s.cost_planned) === 0 && s.status !== 'cancelled' ? <Badge tone="warning" className="ml-1">coût manquant</Badge> : null}</span> : null}
                    </div>
                    {s.status === 'option' ? (
                      <p className="text-sm">Option jusqu’au <strong>{formatDateTimeFr(s.option_deadline)}</strong> <TimeLeft dueAt={s.option_deadline} /> <Badge tone="warning">Non confirmée</Badge></p>
                    ) : null}
                    {s.status === 'confirmed' ? (
                      <p className="text-sm">Confirmée le {formatDateTimeFr(s.confirmed_at)} — réf. <strong>{s.confirmation_ref ?? '—'}</strong> — {s.confirmation_document_id ? <a className="text-brand-600 hover:underline" href={`/api/documents/${s.confirmation_document_id}`}>preuve : {proof ?? 'document'}</a> : <Badge tone="warning">Preuve à joindre</Badge>}</p>
                    ) : null}
                    {s.status === 'cancelled' && detail(s.details, 'cancel_reason') ? <p className="text-sm text-danger-700">Annulée : {detail(s.details, 'cancel_reason')}</p> : null}
                    {s.needs_review ? (
                      <Alert tone="danger" title="À revoir après modification liée">
                        <p>{s.review_reason}</p>
                        {canUpdate ? (
                          <OpsForm action={acknowledgeReview} className="mt-2">
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="dossier_id" value={id} />
                            <div className="flex flex-wrap gap-2">
                              <Input name="note" placeholder="Résultat de la vérification (ex. horaire de prise en charge recalé avec le transporteur)" className="min-w-64 flex-1" aria-label="Résultat de la vérification" />
                              <OpsSubmit size="sm" variant="secondary">Acquitter après revue</OpsSubmit>
                            </div>
                          </OpsForm>
                        ) : null}
                      </Alert>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link href={`/dossiers/${id}/prestations/${s.id}`} className={buttonClass('ghost', 'sm')}>Détails et modification</Link>
                      {s.activity === 'hotel_tn' && s.service_type === 'hotel' && s.status !== 'cancelled' ? (
                        <Link href={`/integrations/hotels/reserver?service=${s.id}`} className={buttonClass('secondary', 'sm')}>Réserver via API</Link>
                      ) : null}
                    </div>
                    {canUpdate && s.status !== 'cancelled' ? (
                      <details className="rounded-lg border border-line">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700">Changer le statut</summary>
                        <div className="border-t border-line p-3">
                          <ServiceStatusForm serviceId={s.id} dossierId={id} status={s.status} documents={docs ?? []} canMargins={canMargins} />
                        </div>
                      </details>
                    ) : null}
                  </CardBody>
                </Card>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
