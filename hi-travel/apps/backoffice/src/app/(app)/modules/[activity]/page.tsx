import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ACTIVITIES, activityLabels, dossierStatusLabels, formatDateFr, formatDateTimeFr, label, type Activity } from '@hi/core'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Money, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { ServicesFilter } from '@/components/ops/services-filter'
import { ServicesList } from '@/components/ops/services-list'
import { TimeLeft } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, getSupplierOptions, sp, type SearchParams } from '@/lib/ops/data'
import { addDaysIso, detail, formatInZone, todayIso } from '@/lib/ops/format'
import { ticketStatusLabels, visaStatusLabels } from '@/lib/ops/labels'
import { fetchServices } from '@/lib/ops/services-query'
import { capacityIssue, findTransportConflicts } from '@/lib/ops/transport'

export const metadata = { title: 'Module métier' }

export default async function ModulePage({ params, searchParams }: { params: Promise<{ activity: string }>; searchParams: SearchParams }) {
  const session = await requireStaff('dossiers')
  const { activity: raw } = await params
  if (!(ACTIVITIES as readonly string[]).includes(raw)) notFound()
  const activity = raw as Activity
  const sparams = await searchParams
  const values = { statut: sp(sparams, 'statut'), fournisseur: sp(sparams, 'fournisseur'), q: sp(sparams, 'q'), du: sp(sparams, 'du'), au: sp(sparams, 'au'), revue: sp(sparams, 'revue'), expire: sp(sparams, 'expire') }
  const [suppliers, { rows, error }] = await Promise.all([
    getSupplierOptions(),
    fetchServices({ activity, statuses: values.statut?.split(','), review: values.revue === '1', expiring48h: values.expire === '48h', supplierId: values.fournisseur, q: values.q, from: values.du, to: values.au }),
  ])
  const counts = { requested: 0, option: 0, confirmed: 0, cancelled: 0 } as Record<string, number>
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1

  return (
    <>
      <PageHeader
        title={activityLabels[activity]}
        description="Liste filtrable, suivi des statuts et accès au dossier commun. Création : depuis un dossier (onglet Prestations) ou un devis."
        breadcrumbs={[{ href: '/modules', label: 'Modules métiers' }]}
        actions={session.can('quotes', 'create') ? <Link href="/devis/nouveau" className={buttonClass('secondary', 'sm')}>Nouveau devis</Link> : null}
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Badge>Demandées : {counts.requested}</Badge><Badge tone="warning">Options : {counts.option}</Badge><Badge tone="success">Confirmées : {counts.confirmed}</Badge><Badge tone="danger">Annulées : {counts.cancelled}</Badge>
      </div>
      <div className="space-y-6">
        <ModuleSpecific activity={activity} billets={sp(sparams, 'billets')} canMargins={session.can('margins')} />
        <ServicesFilter action={`/modules/${activity}`} values={values} suppliers={suppliers} />
        <Card>
          <CardHeader title={`Prestations (${rows.length})`} description={error ? `Erreur : ${error}` : undefined} />
          <CardBody><ServicesList rows={rows} hotelView={activity === 'hotel_tn' || activity === 'hotel_intl'} /></CardBody>
        </Card>
      </div>
    </>
  )
}

async function ModuleSpecific({ activity, billets, canMargins }: { activity: Activity; billets?: string; canMargins: boolean }) {
  const supabase = await db()
  const today = todayIso()

  if (activity === 'ticketing') {
    const [{ data: deadlines }, { data: tickets }] = await Promise.all([
      supabase.from('external_deadlines').select('id, label, due_at, timezone, dossier_id, needs_recheck, dossiers(reference)').eq('kind', 'ticket_issue').eq('status', 'open').order('due_at', { nullsFirst: true }).limit(50),
      supabase.from('tickets').select('id, ticket_number, passenger_name, pnr, status, issue_deadline, sale_price, refund_amount, services!inner(id, dossier_id, description, dossiers(reference))')
        .in('status', billets ? [billets] : ['pending', 'refund_expected']).order('issue_deadline', { nullsFirst: true }).limit(100),
    ])
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Délais d’émission" description="Limites communiquées par le fournisseur ; une limite inconnue reste à compléter (jamais estimée)." />
          <CardBody>
            {deadlines?.length ? (
              <ul className="divide-y divide-line">
                {deadlines.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><Link className="font-medium text-brand-600 hover:underline" href={`/dossiers/${d.dossier_id}/echeances`}>{(d.dossiers as { reference?: string } | null)?.reference}</Link> — {d.label}</span>
                    {d.due_at ? <span className="text-right">{formatInZone(d.due_at, d.timezone)}<br /><TimeLeft dueAt={d.due_at} /></span> : <Badge tone="warning">Délai à compléter</Badge>}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Aucun délai d’émission ouvert" />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={billets ? `Billets — ${label(ticketStatusLabels, billets)}` : 'Billets à émettre et remboursements attendus'} actions={billets ? <Link href="/modules/ticketing" className="text-sm text-brand-600 hover:underline">Tous</Link> : null} />
          <CardBody>
            {tickets?.length ? (
              <ul className="divide-y divide-line">
                {tickets.map((t) => {
                  const s = t.services as { id: string; dossier_id: string; description: string; dossiers?: { reference?: string } | null }
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span><Link className="text-brand-600 hover:underline" href={`/dossiers/${s.dossier_id}/prestations/${s.id}`}>{s.dossiers?.reference}</Link> — {t.passenger_name ?? 'Passager ?'} {t.pnr ? `(PNR ${t.pnr})` : ''}</span>
                      <span className="flex items-center gap-2">
                        <Badge tone={t.status === 'refund_expected' ? 'warning' : 'neutral'}>{label(ticketStatusLabels, t.status)}</Badge>
                        {t.status === 'refund_expected' && t.refund_amount != null ? <Money value={t.refund_amount} /> : t.issue_deadline ? <span className="text-xs">avant {formatDateTimeFr(t.issue_deadline)}</span> : <span className="text-xs text-warning-600">limite à compléter</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : <EmptyState title="Aucun billet en attente" />}
          </CardBody>
        </Card>
      </div>
    )
  }

  if (activity === 'visa') {
    const { data: apps } = await supabase.from('visa_applications')
      .select('id, destination, visa_type, status, decision, appointment_at, checklist, traveller_id, travellers(first_name, last_name), services!inner(id, dossier_id, dossiers!inner(reference, start_date, status))')
      .not('services.dossiers.status', 'in', '(cancelled,archived)').limit(300)
    const cols = ['collecting', 'ready', 'appointment', 'submitted', 'decision_received', 'passport_returned']
    return (
      <Card>
        <CardHeader title="Pipeline des demandes de visa" description="Avancement interne par voyageur et destination — ne préjuge jamais de la décision consulaire." />
        <CardBody>
          <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
            {cols.map((c) => {
              const list = (apps ?? []).filter((a) => a.status === c)
              return (
                <section key={c} className="min-w-44 rounded-lg bg-canvas p-2">
                  <h3 className="mb-2 flex justify-between text-xs font-semibold text-brand-900">{visaStatusLabels[c]} <Badge>{list.length}</Badge></h3>
                  <ul className="space-y-2">
                    {list.map((a) => {
                      const s = a.services as { id: string; dossier_id: string; dossiers: { reference: string; start_date: string | null } }
                      const t = a.travellers as { first_name: string; last_name: string } | null
                      const cl = (Array.isArray(a.checklist) ? a.checklist : []) as Array<{ received?: boolean }>
                      const missing = cl.filter((x) => !x.received).length
                      return (
                        <li key={a.id}>
                          <Link href={`/dossiers/${s.dossier_id}/prestations/${s.id}`} className="block rounded-md border border-line bg-white p-2 text-xs hover:border-brand-300">
                            <p className="font-medium text-ink">{t ? `${t.first_name} ${t.last_name}` : 'Voyageur ?'}</p>
                            <p className="text-muted">{a.destination} · {s.dossiers.reference}</p>
                            <p className="text-muted">Départ {formatDateFr(s.dossiers.start_date)}</p>
                            {missing ? <Badge tone="warning">{missing} pièce(s) manquante(s)</Badge> : cl.length ? <Badge tone="success">Pièces complètes</Badge> : null}
                            {a.appointment_at ? <p className="mt-1">RDV {formatDateTimeFr(a.appointment_at)}</p> : null}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </CardBody>
      </Card>
    )
  }

  if (activity === 'transport') {
    const { data: transports } = await supabase.from('services')
      .select('id, description, dossier_id, start_at, end_at, status, details, dossiers!inner(reference, status)')
      .in('service_type', ['transfer', 'transport']).neq('status', 'cancelled').not('dossiers.status', 'in', '(cancelled,archived)')
      .gte('start_at', `${addDaysIso(today, -1)}T00:00:00Z`).order('start_at').limit(500)
    const items = (transports ?? []).map((t) => ({ ...t, dossier_reference: (t.dossiers as { reference?: string } | null)?.reference }))
    const conflicts = findTransportConflicts(items)
    const capacity = items.map((t) => ({ t, issue: capacityIssue(t) })).filter((x) => x.issue)
    const missing = items.filter((t) => !detail(t.details, 'vehicle') || !detail(t.details, 'driver'))
    return (
      <Card>
        <CardHeader title="Contrôle véhicules et chauffeurs" description="Chevauchements horaires pour un même véhicule ou chauffeur identifié, et capacité insuffisante (prestations à venir)." />
        <CardBody className="space-y-3">
          {conflicts.length === 0 && capacity.length === 0 ? <Alert tone="success">Aucun chevauchement ni dépassement de capacité détecté.</Alert> : null}
          {conflicts.map((c, i) => (
            <Alert key={i} tone="danger" title={`${c.resource === 'vehicle' ? 'Véhicule' : 'Chauffeur'} « ${c.value} » en double`}>
              <Link className="underline" href={`/dossiers/${c.a.dossier_id}/prestations/${c.a.id}`}>{c.a.description} ({c.a.dossier_reference}) — {formatInZone(c.a.start_at)}</Link>
              {' / '}
              <Link className="underline" href={`/dossiers/${c.b.dossier_id}/prestations/${c.b.id}`}>{c.b.description} ({c.b.dossier_reference}) — {formatInZone(c.b.start_at)}</Link>
            </Alert>
          ))}
          {capacity.map(({ t, issue }) => <Alert key={t.id} tone="warning"><Link className="underline" href={`/dossiers/${t.dossier_id}/prestations/${t.id}`}>{t.description} ({t.dossier_reference})</Link> : {issue}</Alert>)}
          {missing.length ? <p className="text-sm text-muted">{missing.length} transfert(s) à venir sans véhicule ou chauffeur identifié : contrôle de chevauchement impossible pour ceux-ci.</p> : null}
        </CardBody>
      </Card>
    )
  }

  if (activity === 'mice') {
    const { data: events } = await supabase.from('dossiers').select('id, reference, title, start_date, end_date, status, adults, children, clients(display_name)')
      .eq('activity', 'mice').not('status', 'in', '(cancelled,archived)').order('start_date', { nullsFirst: false }).limit(100)
    const ids = (events ?? []).map((e) => e.id)
    const { data: parts } = ids.length ? await supabase.from('event_participants').select('dossier_id, attendance').in('dossier_id', ids) : { data: [] }
    return (
      <Card>
        <CardHeader title="Événements" description="Effectifs : participants actifs comparés au prévisionnel du dossier." />
        <CardBody>
          {events?.length ? (
            <Table className="-mx-5">
              <thead><tr><Th>Événement</Th><Th>Client</Th><Th>Dates</Th><Th>Statut</Th><Th className="text-right">Participants</Th></tr></thead>
              <tbody>
                {events.map((e) => {
                  const p = (parts ?? []).filter((x) => x.dossier_id === e.id)
                  const act = p.filter((x) => x.attendance !== 'cancelled').length
                  const forecast = e.adults + e.children
                  return (
                    <tr key={e.id}>
                      <Td><Link className="font-medium text-brand-600 hover:underline" href={`/dossiers/${e.id}/participants`}>{e.reference}</Link><p className="text-xs text-muted">{e.title}</p></Td>
                      <Td>{(e.clients as { display_name?: string } | null)?.display_name}</Td>
                      <Td>{formatDateFr(e.start_date)} → {formatDateFr(e.end_date)}</Td>
                      <Td><StatusBadge status={e.status} labels={dossierStatusLabels} /></Td>
                      <Td className="text-right">{act} / {forecast} {act > forecast ? <Badge tone="warning">au-delà du prévisionnel</Badge> : null}<p className="text-xs text-muted">{p.filter((x) => x.attendance === 'confirmed').length} confirmé(s)</p></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          ) : <EmptyState title="Aucun événement en cours" />}
        </CardBody>
      </Card>
    )
  }

  if (activity === 'organized_trip' || activity === 'circuit') {
    const { data: deps } = await supabase.from('departures').select('id, code, start_date, end_date, capacity, seats_confirmed, seats_on_option, status, min_participants, price_adult, offers!inner(title, activity, is_omra)')
      .eq('offers.activity', activity).neq('status', 'cancelled').gte('end_date', today).order('start_date').limit(100)
    return (
      <Card>
        <CardHeader title="Départs" description="Capacité, places confirmées, options et disponibilités." actions={<Link href="/departs" className="text-sm text-brand-600 hover:underline">Départs et groupes</Link>} />
        <CardBody>
          {deps?.length ? (
            <Table className="-mx-5">
              <thead><tr><Th>Départ</Th><Th>Dates</Th><Th className="text-right">Capacité</Th><Th className="text-right">Confirmées</Th><Th className="text-right">Options</Th><Th className="text-right">Disponibles</Th><Th className="text-right">Prix adulte</Th></tr></thead>
              <tbody>
                {deps.map((d) => {
                  const avail = d.capacity - d.seats_confirmed - d.seats_on_option
                  const o = d.offers as { title: string; is_omra: boolean }
                  return (
                    <tr key={d.id}>
                      <Td><Link className="font-medium text-brand-600 hover:underline" href={`/departs/${d.id}`}>{d.code}</Link><p className="text-xs text-muted">{o.title} {o.is_omra ? <Badge tone="accent">Omra</Badge> : null}</p></Td>
                      <Td>{formatDateFr(d.start_date)} → {formatDateFr(d.end_date)}</Td>
                      <Td className="text-right">{d.capacity}</Td>
                      <Td className="text-right">{d.seats_confirmed}{d.min_participants && d.seats_confirmed < d.min_participants ? <p className="text-xs text-warning-600">min. {d.min_participants}</p> : null}</Td>
                      <Td className="text-right">{d.seats_on_option}</Td>
                      <Td className="text-right"><Badge tone={avail <= 0 ? 'danger' : avail < 5 ? 'warning' : 'success'}>{avail}</Badge></Td>
                      <Td className="text-right"><Money value={d.price_adult} /></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          ) : <EmptyState title="Aucun départ à venir" />}
        </CardBody>
      </Card>
    )
  }

  if (activity === 'hotel_tn' || activity === 'hotel_intl') {
    return (
      <Alert tone="info">
        Les nuitées sont calculées à partir des dates d’arrivée et de départ de chaque hôtel, et comparées à la durée du voyage du dossier (colonne « Nuitées / voyage »).
        {activity === 'hotel_tn' ? ' Les réservations par API se lancent depuis la prestation (« Réserver via API »).' : ''}
        {canMargins ? ' Les coûts en devise sont convertis avec le taux daté saisi sur la prestation.' : ''}
      </Alert>
    )
  }
  return null
}
