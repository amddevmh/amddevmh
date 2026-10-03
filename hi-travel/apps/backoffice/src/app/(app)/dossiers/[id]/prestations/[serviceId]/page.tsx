import Link from 'next/link'
import { notFound } from 'next/navigation'
import { activityLabels, formatDateTimeFr, formatMoney, label, serviceStatusLabels, serviceTypeLabels } from '@hi/core'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, StatusBadge, Table, Td, Textarea, Th, buttonClass } from '@hi/ui'
import { DeadlineTable, type DeadlineRow } from '@/components/ops/deadline-table'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { ServiceForm } from '@/components/ops/service-form'
import { ServiceStatusForm } from '@/components/ops/service-status-form'
import { DeadlineCreateForm } from '@/components/ops/task-forms'
import { Disclosure, Section } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { acknowledgeReview, addFlightSegment, deleteFlightSegment, saveTicket, saveVisaApplication } from '@/lib/ops/actions/dossiers'
import { db, getHotelOptions, getStaff, getSupplierOptions } from '@/lib/ops/data'
import { getDossier, getDossierServices } from '@/lib/ops/dossier'
import { formatInZone, isoToZonedLocal } from '@/lib/ops/format'
import { ticketStatusLabels, visaDecisionLabels, visaStatusLabels } from '@/lib/ops/labels'
import { capacityIssue, findTransportConflicts } from '@/lib/ops/transport'

export const metadata = { title: 'Prestation' }

const TZ = ['Africa/Tunis', 'Europe/Paris', 'Europe/Istanbul', 'Asia/Riyadh', 'Africa/Cairo', 'Europe/London', 'Asia/Dubai', 'America/New_York', 'UTC']

export default async function ServicePage({ params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const session = await requireStaff('dossiers')
  const { id, serviceId } = await params
  const d = await getDossier(id)
  const services = await getDossierServices(id)
  const s = services.find((x) => x.id === serviceId)
  if (!s) notFound()
  const supabase = await db()
  const isFlight = s.service_type === 'flight'
  const isVisa = s.service_type === 'visa'
  const isTransfer = ['transfer', 'transport'].includes(s.service_type)
  const [suppliers, hotels, staff, segments, tickets, visas, docs, deadlines, travellers, bookings, transports] = await Promise.all([
    getSupplierOptions(), getHotelOptions(), getStaff(),
    isFlight ? supabase.from('flight_segments').select('*').eq('service_id', serviceId).order('seq').order('departs_at') : Promise.resolve({ data: [] }),
    isFlight ? supabase.from('tickets').select('*').eq('service_id', serviceId).order('created_at') : Promise.resolve({ data: [] }),
    isVisa ? supabase.from('visa_applications').select('*').eq('service_id', serviceId).order('created_at') : Promise.resolve({ data: [] }),
    session.can('documents') ? supabase.from('documents').select('id, title, kind, service_id, created_at').eq('dossier_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    session.can('tasks') ? supabase.from('external_deadlines').select('*, dossiers(reference, title), services(description)').eq('service_id', serviceId).order('due_at', { nullsFirst: true }) : Promise.resolve({ data: [] }),
    supabase.from('dossier_travellers').select('traveller_id, travellers(id, first_name, last_name)').eq('dossier_id', id),
    s.activity === 'hotel_tn' ? supabase.from('hotel_booking_requests').select('id, request_id, connector_code, status, external_ref, amount, created_at, last_error').eq('service_id', serviceId).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    isTransfer && s.start_at ? supabase.from('services').select('id, description, dossier_id, start_at, end_at, status, details, dossiers(reference)')
      .in('service_type', ['transfer', 'transport']).neq('status', 'cancelled')
      .gte('start_at', new Date(Date.parse(s.start_at) - 86400000).toISOString()).lte('start_at', new Date(Date.parse(s.start_at) + 86400000).toISOString())
      : Promise.resolve({ data: [] }),
  ])
  const canUpdate = session.can('dossiers', 'update')
  const canMargins = session.can('margins')
  const travellerOpts = (travellers.data ?? []).map((t) => {
    const tr = t.travellers as { id: string; first_name: string; last_name: string } | null
    return { id: t.traveller_id, name: tr ? `${tr.first_name} ${tr.last_name}` : t.traveller_id }
  })
  const serviceDocs = (docs.data ?? []).filter((x) => x.service_id === serviceId)
  const conflicts = isTransfer
    ? findTransportConflicts((transports.data ?? []).map((t) => ({ ...t, dossier_reference: (t.dossiers as { reference?: string } | null)?.reference }))).filter((c) => c.a.id === serviceId || c.b.id === serviceId)
    : []
  const capIssue = isTransfer ? capacityIssue(s) : null
  const flights = services.filter((x) => x.service_type === 'flight' && x.status !== 'cancelled')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/dossiers/${id}/prestations`} className="text-sm text-brand-600 hover:underline">← Toutes les prestations</Link>
        {s.activity === 'hotel_tn' && s.service_type === 'hotel' && s.status !== 'cancelled' ? (
          <Link href={`/integrations/hotels/reserver?service=${s.id}`} className={buttonClass('accent', 'sm')}>Réserver via API</Link>
        ) : null}
      </div>

      <Card>
        <CardHeader
          title={<span className="flex flex-wrap items-center gap-2">{s.description}<StatusBadge status={s.status} labels={serviceStatusLabels} /></span>}
          description={`${label(activityLabels, s.activity)} — ${label(serviceTypeLabels, s.service_type)}${s.suppliers ? ` — ${(s.suppliers as { name: string }).name}` : ''}`}
        />
        <CardBody className="space-y-3">
          {s.status === 'option' ? <Alert tone="warning">Option non confirmée jusqu’au {formatDateTimeFr(s.option_deadline)}.</Alert> : null}
          {s.status === 'confirmed' ? <p className="text-sm">Confirmée le {formatDateTimeFr(s.confirmed_at)} — réf. <strong>{s.confirmation_ref}</strong> {s.confirmation_document_id ? <a href={`/api/documents/${s.confirmation_document_id}`} className="text-brand-600 hover:underline">— télécharger la preuve</a> : <Badge tone="warning">Preuve à joindre</Badge>}</p> : null}
          {s.needs_review ? (
            <Alert tone="danger" title="À revoir">
              {s.review_reason}
              {canUpdate ? (
                <OpsForm action={acknowledgeReview} className="mt-2">
                  <input type="hidden" name="id" value={s.id} /><input type="hidden" name="dossier_id" value={id} />
                  <div className="flex flex-wrap gap-2"><Input name="note" placeholder="Résultat de la vérification" className="min-w-64 flex-1" aria-label="Résultat" /><OpsSubmit size="sm" variant="secondary">Acquitter après revue</OpsSubmit></div>
                </OpsForm>
              ) : null}
            </Alert>
          ) : null}
          {conflicts.map((c, i) => {
            const other = c.a.id === serviceId ? c.b : c.a
            return <Alert key={i} tone="danger" title={`Chevauchement ${c.resource === 'vehicle' ? 'véhicule' : 'chauffeur'} « ${c.value} »`}>Même {c.resource === 'vehicle' ? 'véhicule' : 'chauffeur'} sur « {other.description} » ({other.dossier_reference}) à {formatInZone(other.start_at)}.</Alert>
          })}
          {capIssue ? <Alert tone="danger">{capIssue}</Alert> : null}
          {canUpdate && s.status !== 'cancelled' ? (
            <Disclosure summary="Changer le statut (option, confirmation, annulation)">
              <ServiceStatusForm serviceId={s.id} dossierId={id} status={s.status} documents={docs.data ?? []} canMargins={canMargins} />
            </Disclosure>
          ) : null}
        </CardBody>
      </Card>

      {isFlight ? (
        <Section title="Segments de vol" description="Horaires saisis en heure locale de chaque aéroport, avec leur fuseau.">
          {segments.data?.length ? (
            <Table className="-mx-5">
              <thead><tr><Th>#</Th><Th>Vol</Th><Th>Départ (local)</Th><Th>Arrivée (local)</Th><Th>PNR</Th><Th>Bagages</Th><Th /></tr></thead>
              <tbody>
                {segments.data.map((g) => (
                  <tr key={g.id}>
                    <Td>{g.seq}</Td>
                    <Td className="font-medium">{g.flight_number} <span className="text-xs text-muted">{g.carrier}</span><p className="text-xs">{g.from_airport} → {g.to_airport}</p></Td>
                    <Td className="whitespace-nowrap">{formatInZone(g.departs_at, g.departs_tz, false)}<p className="text-xs text-muted">{g.departs_tz}</p></Td>
                    <Td className="whitespace-nowrap">{formatInZone(g.arrives_at, g.arrives_tz, false)}<p className="text-xs text-muted">{g.arrives_tz}</p></Td>
                    <Td>{g.pnr ?? '—'}</Td>
                    <Td>{g.baggage ?? '—'}</Td>
                    <Td>{canUpdate ? <OpsForm action={deleteFlightSegment} inline><input type="hidden" name="id" value={g.id} /><OpsSubmit size="sm" variant="ghost" confirm="Retirer ce segment ? Les transferts liés seront signalés à revoir si les horaires changent.">Retirer</OpsSubmit></OpsForm> : null}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="Aucun segment" />}
          {canUpdate ? (
            <Disclosure summary="Ajouter un segment" className="mt-3">
              <OpsForm action={addFlightSegment} resetOnSuccess>
                <input type="hidden" name="service_id" value={s.id} />
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Ordre" htmlFor="seq"><Input id="seq" name="seq" type="number" min={1} defaultValue={(segments.data?.length ?? 0) + 1} /></Field>
                  <Field label="Compagnie" htmlFor="carrier" required><Input id="carrier" name="carrier" placeholder="TU" /></Field>
                  <Field label="N° de vol" htmlFor="flight_number" required><Input id="flight_number" name="flight_number" placeholder="TU214" /></Field>
                  <Field label="PNR" htmlFor="pnr"><Input id="pnr" name="pnr" /></Field>
                  <Field label="De (IATA)" htmlFor="from_airport" required><Input id="from_airport" name="from_airport" maxLength={3} placeholder="TUN" /></Field>
                  <Field label="Départ (heure locale)" htmlFor="departs_local" required><Input id="departs_local" name="departs_local" type="datetime-local" /></Field>
                  <Field label="Fuseau départ" htmlFor="departs_tz"><Select id="departs_tz" name="departs_tz" defaultValue="Africa/Tunis">{TZ.map((z) => <option key={z}>{z}</option>)}</Select></Field>
                  <Field label="Bagages" htmlFor="baggage"><Input id="baggage" name="baggage" placeholder="23 kg" /></Field>
                  <Field label="Vers (IATA)" htmlFor="to_airport" required><Input id="to_airport" name="to_airport" maxLength={3} placeholder="IST" /></Field>
                  <Field label="Arrivée (heure locale)" htmlFor="arrives_local" required><Input id="arrives_local" name="arrives_local" type="datetime-local" /></Field>
                  <Field label="Fuseau arrivée" htmlFor="arrives_tz"><Select id="arrives_tz" name="arrives_tz" defaultValue="Europe/Istanbul">{TZ.map((z) => <option key={z}>{z}</option>)}</Select></Field>
                </div>
                <OpsSubmit variant="secondary">Ajouter le segment</OpsSubmit>
              </OpsForm>
            </Disclosure>
          ) : null}
        </Section>
      ) : null}

      {isFlight ? (
        <Section title="Billets" description="Émission, réémission, remboursement : états distincts. La limite d’émission est une échéance fournisseur (onglet Échéances).">
          {tickets.data?.length ? (
            <div className="space-y-3">
              {tickets.data.map((t) => (
                <div key={t.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{t.passenger_name ?? 'Passager à préciser'} — {t.ticket_number ?? 'n° à venir'} {t.pnr ? `(PNR ${t.pnr})` : ''}</span>
                    <Badge tone={t.status === 'issued' || t.status === 'reissued' ? 'success' : t.status === 'refund_expected' ? 'warning' : t.status === 'void' ? 'danger' : 'neutral'}>{label(ticketStatusLabels, t.status)}</Badge>
                  </div>
                  <p className="text-xs text-muted">Limite d’émission : {t.issue_deadline ? formatDateTimeFr(t.issue_deadline) : 'à compléter'}{t.issued_at ? ` — émis le ${formatDateTimeFr(t.issued_at)}` : ''} — vendu {formatMoney(t.sale_price)}{canMargins ? ` (tarif ${formatMoney(t.fare)} + taxes ${formatMoney(t.taxes)} + frais ${formatMoney(t.service_fee)})` : ''}{t.penalty ? ` — pénalité ${formatMoney(t.penalty)}` : ''}{t.refund_amount != null ? ` — remboursement ${formatMoney(t.refund_amount)}` : ''}</p>
                  {canUpdate ? (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-brand-600">Mettre à jour</summary>
                      <TicketForm serviceId={s.id} ticket={t} travellers={travellerOpts} canMargins={canMargins} />
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          ) : <EmptyState title="Aucun billet" />}
          {canUpdate ? <Disclosure summary="Ajouter un billet" className="mt-3"><TicketForm serviceId={s.id} travellers={travellerOpts} canMargins={canMargins} /></Disclosure> : null}
        </Section>
      ) : null}

      {isVisa ? (
        <Section title="Dossiers visa" description="Un dossier par voyageur et destination. Les statuts internes décrivent l’avancement et ne garantissent jamais la délivrance.">
          {visas.data?.length ? visas.data.map((v) => {
            const checklist = (Array.isArray(v.checklist) ? v.checklist : []) as Array<{ label?: string; received?: boolean }>
            const missing = checklist.filter((c) => !c.received).length
            const tr = travellerOpts.find((t) => t.id === v.traveller_id)
            return (
              <div key={v.id} className="mb-3 rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{tr?.name ?? 'Voyageur à préciser'} — {v.destination} ({v.visa_type})</p>
                  <span className="flex gap-2"><Badge tone="info">{label(visaStatusLabels, v.status)}</Badge>{v.decision ? <Badge tone={v.decision === 'granted' ? 'success' : v.decision === 'refused' ? 'danger' : 'warning'}>{label(visaDecisionLabels, v.decision)}</Badge> : null}</span>
                </div>
                <p className="text-xs text-muted">Pièces : {checklist.length - missing}/{checklist.length} reçues{missing ? ` — ${missing} manquante(s)` : ''} · RDV {v.appointment_at ? formatDateTimeFr(v.appointment_at) : 'à fixer'} · dépôt {v.submitted_at ? formatDateTimeFr(v.submitted_at) : '—'} · passeport restitué {v.passport_returned_at ? formatDateTimeFr(v.passport_returned_at) : '—'}</p>
                <p className="text-xs text-muted">Frais consulaires {formatMoney(v.consular_fee)} · frais de centre {formatMoney(v.center_fee)} · honoraires agence {formatMoney(v.agency_fee)}</p>
                {canUpdate ? (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-brand-600">Mettre à jour le dossier visa</summary>
                    <VisaForm serviceId={s.id} visa={v} travellers={travellerOpts} />
                  </details>
                ) : null}
              </div>
            )
          }) : <EmptyState title="Aucun dossier visa" />}
          {canUpdate ? <Disclosure summary="Nouveau dossier visa (par voyageur)"><VisaForm serviceId={s.id} travellers={travellerOpts} /></Disclosure> : null}
        </Section>
      ) : null}

      {s.activity === 'hotel_tn' && bookings.data?.length ? (
        <Section title="Réservations via API">
          <ul className="space-y-1 text-sm">
            {bookings.data.map((b) => <li key={b.id}>{formatDateTimeFr(b.created_at)} — {b.connector_code} — <Badge tone={b.status === 'confirmed' ? 'success' : b.status === 'to_verify' ? 'warning' : b.status === 'failed' ? 'danger' : 'neutral'}>{b.status}</Badge> {b.external_ref ? `réf. ${b.external_ref}` : ''} {b.last_error ? <span className="text-danger-700">{b.last_error}</span> : null}</li>)}
          </ul>
        </Section>
      ) : null}

      <Section title="Détails de la prestation">
        {canUpdate ? (
          <ServiceForm
            dossierId={id} activity={s.activity} serviceType={s.service_type} service={s} suppliers={suppliers} hotels={hotels}
            linkable={(isTransfer ? flights : services.filter((x) => x.status !== 'cancelled')).map((x) => ({ id: x.id, description: x.description, service_type: x.service_type }))}
            canMargins={canMargins}
          />
        ) : <p className="text-sm text-muted">Lecture seule.</p>}
      </Section>

      {session.can('tasks') ? (
        <Section title="Échéances fournisseurs de la prestation">
          <DeadlineTable rows={(deadlines.data ?? []) as DeadlineRow[]} canUpdate={session.can('tasks', 'update')} showDossier={false} />
          {session.can('tasks', 'update') ? (
            <Disclosure summary="Ajouter une échéance (limite d’émission, règlement…)" className="mt-3">
              <DeadlineCreateForm dossierId={id} services={[{ id: s.id, description: s.description }]} staff={staff} />
            </Disclosure>
          ) : null}
        </Section>
      ) : null}

      {session.can('documents') ? (
        <Section title="Documents de la prestation" actions={<Link href={`/dossiers/${id}/documents`} className={buttonClass('ghost', 'sm')}>Déposer un document</Link>}>
          {serviceDocs.length ? (
            <ul className="space-y-1 text-sm">{serviceDocs.map((x) => <li key={x.id}><a className="text-brand-600 hover:underline" href={`/api/documents/${x.id}`}>{x.title}</a> <span className="text-xs text-muted">({formatDateTimeFr(x.created_at)})</span></li>)}</ul>
          ) : <p className="text-sm text-muted">Aucun document rattaché à cette prestation.</p>}
        </Section>
      ) : null}
      <p className="text-xs text-muted">Dossier {d.reference}</p>
    </div>
  )
}

function TicketForm({ serviceId, ticket, travellers, canMargins }: {
  serviceId: string
  ticket?: { id: string; traveller_id: string | null; passenger_name: string | null; pnr: string | null; ticket_number: string | null; status: string; issue_deadline: string | null; fare: number; taxes: number; service_fee: number; sale_price: number; penalty: number; refund_amount: number | null }
  travellers: Array<{ id: string; name: string }>
  canMargins: boolean
}) {
  return (
    <OpsForm action={saveTicket} resetOnSuccess={!ticket} className="mt-2">
      {ticket ? <input type="hidden" name="id" value={ticket.id} /> : null}
      <input type="hidden" name="service_id" value={serviceId} />
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Voyageur" htmlFor={`tt-${ticket?.id ?? 'n'}`}>
          <Select id={`tt-${ticket?.id ?? 'n'}`} name="traveller_id" defaultValue={ticket?.traveller_id ?? ''}><option value="">—</option>{travellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        </Field>
        <Field label="Nom sur le billet" htmlFor={`tp-${ticket?.id ?? 'n'}`}><Input id={`tp-${ticket?.id ?? 'n'}`} name="passenger_name" defaultValue={ticket?.passenger_name ?? ''} /></Field>
        <Field label="PNR" htmlFor={`tr-${ticket?.id ?? 'n'}`}><Input id={`tr-${ticket?.id ?? 'n'}`} name="pnr" defaultValue={ticket?.pnr ?? ''} /></Field>
        <Field label="N° de billet" htmlFor={`tn-${ticket?.id ?? 'n'}`}><Input id={`tn-${ticket?.id ?? 'n'}`} name="ticket_number" defaultValue={ticket?.ticket_number ?? ''} /></Field>
        <Field label="État" htmlFor={`ts-${ticket?.id ?? 'n'}`}>
          <Select id={`ts-${ticket?.id ?? 'n'}`} name="status" defaultValue={ticket?.status ?? 'pending'}>{Object.entries(ticketStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Limite d’émission (Tunis)" htmlFor={`ti-${ticket?.id ?? 'n'}`} hint="Uniquement si communiquée par le fournisseur"><Input id={`ti-${ticket?.id ?? 'n'}`} name="issue_deadline" type="datetime-local" defaultValue={isoToZonedLocal(ticket?.issue_deadline)} /></Field>
        <Field label="Prix vendu" htmlFor={`tv-${ticket?.id ?? 'n'}`}><Input id={`tv-${ticket?.id ?? 'n'}`} name="sale_price" type="number" step="0.001" min={0} defaultValue={ticket?.sale_price ?? 0} /></Field>
        {canMargins ? (
          <>
            <Field label="Tarif fournisseur" htmlFor={`tf-${ticket?.id ?? 'n'}`}><Input id={`tf-${ticket?.id ?? 'n'}`} name="fare" type="number" step="0.001" min={0} defaultValue={ticket?.fare ?? 0} /></Field>
            <Field label="Taxes" htmlFor={`tx-${ticket?.id ?? 'n'}`}><Input id={`tx-${ticket?.id ?? 'n'}`} name="taxes" type="number" step="0.001" min={0} defaultValue={ticket?.taxes ?? 0} /></Field>
            <Field label="Frais de service" htmlFor={`tsf-${ticket?.id ?? 'n'}`}><Input id={`tsf-${ticket?.id ?? 'n'}`} name="service_fee" type="number" step="0.001" min={0} defaultValue={ticket?.service_fee ?? 0} /></Field>
          </>
        ) : null}
        <Field label="Pénalité" htmlFor={`tpe-${ticket?.id ?? 'n'}`}><Input id={`tpe-${ticket?.id ?? 'n'}`} name="penalty" type="number" step="0.001" min={0} defaultValue={ticket?.penalty ?? 0} /></Field>
        <Field label="Remboursement attendu / reçu" htmlFor={`tre-${ticket?.id ?? 'n'}`}><Input id={`tre-${ticket?.id ?? 'n'}`} name="refund_amount" type="number" step="0.001" min={0} defaultValue={ticket?.refund_amount ?? ''} /></Field>
      </div>
      <OpsSubmit size="sm" variant="secondary">{ticket ? 'Mettre à jour le billet' : 'Ajouter le billet'}</OpsSubmit>
    </OpsForm>
  )
}

function VisaForm({ serviceId, visa, travellers }: {
  serviceId: string
  visa?: { id: string; traveller_id: string | null; destination: string; visa_type: string; checklist_version: string | null; checklist: unknown; appointment_at: string | null; submitted_at: string | null; status: string; decision: string | null; consular_fee: number; center_fee: number; agency_fee: number; passport_returned_at: string | null; expiry_date: string | null; notes: string | null }
  travellers: Array<{ id: string; name: string }>
}) {
  const k = visa?.id ?? 'new'
  const checklist = (Array.isArray(visa?.checklist) ? visa.checklist : []) as Array<{ label?: string; received?: boolean }>
  const defaultList = checklist.length ? checklist.map((c) => c.label ?? '').join('\n') : 'Passeport valide 6 mois après le retour\nPhotos d’identité\nFormulaire de demande signé\nRéservation d’hôtel\nBillet aller-retour\nAttestation de travail / justificatifs financiers'
  return (
    <OpsForm action={saveVisaApplication} resetOnSuccess={!visa} className="mt-2">
      {visa ? <input type="hidden" name="id" value={visa.id} /> : null}
      <input type="hidden" name="service_id" value={serviceId} />
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Voyageur" htmlFor={`vt-${k}`}>
          <Select id={`vt-${k}`} name="traveller_id" defaultValue={visa?.traveller_id ?? ''}><option value="">—</option>{travellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        </Field>
        <Field label="Destination" htmlFor={`vd-${k}`} required><Input id={`vd-${k}`} name="destination" defaultValue={visa?.destination ?? ''} /></Field>
        <Field label="Type de visa" htmlFor={`vty-${k}`}><Input id={`vty-${k}`} name="visa_type" defaultValue={visa?.visa_type ?? 'tourism'} /></Field>
        <Field label="Version de la checklist" htmlFor={`vcv-${k}`}><Input id={`vcv-${k}`} name="checklist_version" defaultValue={visa?.checklist_version ?? ''} placeholder="Ex. FR-2026-09" /></Field>
        <Field label="Pièces demandées (une par ligne)" htmlFor={`vcl-${k}`} className="md:col-span-2"><Textarea id={`vcl-${k}`} name="checklist_text" defaultValue={defaultList} /></Field>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-sm font-medium">Pièces reçues</legend>
          {checklist.length ? checklist.map((c, i) => (
            <label key={i} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`received_${i}`} defaultChecked={!!c.received} className="size-4" /> {c.label}</label>
          )) : <p className="text-xs text-muted">Enregistrer d’abord la checklist pour cocher les pièces reçues.</p>}
        </fieldset>
        <Field label="Rendez-vous" htmlFor={`va-${k}`}><Input id={`va-${k}`} name="appointment_at" type="datetime-local" defaultValue={isoToZonedLocal(visa?.appointment_at)} /></Field>
        <Field label="Dépôt" htmlFor={`vs-${k}`}><Input id={`vs-${k}`} name="submitted_at" type="datetime-local" defaultValue={isoToZonedLocal(visa?.submitted_at)} /></Field>
        <Field label="Avancement" htmlFor={`vst-${k}`}>
          <Select id={`vst-${k}`} name="status" defaultValue={visa?.status ?? 'collecting'}>{Object.entries(visaStatusLabels).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}</Select>
        </Field>
        <Field label="Décision reçue" htmlFor={`vde-${k}`}>
          <Select id={`vde-${k}`} name="decision" defaultValue={visa?.decision ?? ''}><option value="">—</option>{Object.entries(visaDecisionLabels).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}</Select>
        </Field>
        <Field label="Restitution du passeport" htmlFor={`vp-${k}`}><Input id={`vp-${k}`} name="passport_returned_at" type="datetime-local" defaultValue={isoToZonedLocal(visa?.passport_returned_at)} /></Field>
        <Field label="Expiration du visa" htmlFor={`ve-${k}`}><Input id={`ve-${k}`} name="expiry_date" type="date" defaultValue={visa?.expiry_date ?? ''} /></Field>
        <Field label="Frais consulaires" htmlFor={`vfc-${k}`}><Input id={`vfc-${k}`} name="consular_fee" type="number" step="0.001" min={0} defaultValue={visa?.consular_fee ?? 0} /></Field>
        <Field label="Frais de centre" htmlFor={`vfm-${k}`}><Input id={`vfm-${k}`} name="center_fee" type="number" step="0.001" min={0} defaultValue={visa?.center_fee ?? 0} /></Field>
        <Field label="Honoraires agence" htmlFor={`vfa-${k}`}><Input id={`vfa-${k}`} name="agency_fee" type="number" step="0.001" min={0} defaultValue={visa?.agency_fee ?? 0} /></Field>
        <Field label="Notes" htmlFor={`vn-${k}`} className="md:col-span-4"><Input id={`vn-${k}`} name="notes" defaultValue={visa?.notes ?? ''} /></Field>
      </div>
      <OpsSubmit size="sm" variant="secondary">{visa ? 'Mettre à jour' : 'Créer le dossier visa'}</OpsSubmit>
    </OpsForm>
  )
}
