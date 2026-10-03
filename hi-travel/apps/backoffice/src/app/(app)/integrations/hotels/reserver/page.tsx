import Link from 'next/link'
import { activityLabels, addDays, formatMoney, label, serviceStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Card, CardBody, CardHeader, DefinitionList, EmptyState, StatusBadge, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { HotelSearch } from '@/components/admin/hotel-search'
import { requireStaff } from '@/lib/auth'
import { isUuid, sp, todayTunis, type SearchParams } from '@/lib/fin/format'

export const metadata = { title: 'Réserver un hôtel via API' }

export default async function ReserverPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('integrations', 'read')
  const params = await searchParams
  const serviceId = sp(params.service)
  const supabase = await createClient()
  if (!isUuid(serviceId)) {
    return (
      <>
        <PageHeader title="Réserver un hôtel via API" breadcrumbs={[{ href: '/integrations/hotels', label: 'API hôtels Tunisie' }]} />
        <Card><EmptyState title="Prestation non précisée" description="Ouvrez cette page depuis une prestation hôtel d’un dossier (bouton « Réserver via API »)." /></Card>
      </>
    )
  }
  const { data: s } = await supabase
    .from('services')
    .select('id, description, activity, service_type, status, start_date, end_date, hotel_id, room_type, board, occupancy, external_provider, external_ref, cost_planned, cost_confirmed, sale_price, dossiers(id, reference, title, destination, adults, children), hotels(id, name, city)')
    .eq('id', serviceId)
    .maybeSingle()
  if (!s) {
    return (
      <>
        <PageHeader title="Réserver un hôtel via API" breadcrumbs={[{ href: '/integrations/hotels', label: 'API hôtels Tunisie' }]} />
        <Card><EmptyState title="Prestation introuvable" description="La prestation n’existe pas ou vos droits ne permettent pas de la consulter." /></Card>
      </>
    )
  }
  const [{ data: hotels }, { data: existing }] = await Promise.all([
    supabase.from('hotels').select('id, name, city').eq('country', 'TN').eq('active', true).order('name'),
    supabase.from('hotel_booking_requests').select('id, status, connector_code, external_ref, last_error, attempts').eq('service_id', s.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const cities = [...new Set((hotels ?? []).map((h) => h.city))].sort()
  const checkIn = s.start_date ?? addDays(todayTunis(), 30)
  const checkOut = s.end_date && s.end_date > checkIn ? s.end_date : addDays(checkIn, 1)
  const canBook = session.can('dossiers', 'update')
  const city = s.hotels?.city ?? cities.find((c) => c.toLowerCase() === (s.dossiers?.destination ?? '').toLowerCase())

  return (
    <>
      <PageHeader
        title="Réserver un hôtel via API"
        description="Recherche sur les deux fournisseurs, revérification du prix, puis réservation avec un identifiant unique de demande (aucune double réservation)."
        breadcrumbs={[{ href: '/integrations/hotels', label: 'API hôtels Tunisie' }]}
        actions={s.dossiers ? <Link className={buttonClass('secondary')} href={`/dossiers/${s.dossiers.id}`}>Dossier {s.dossiers.reference}</Link> : null}
      />
      <Card className="mb-5">
        <CardHeader title={s.description} actions={<StatusBadge status={s.status} labels={serviceStatusLabels} />} />
        <CardBody>
          <DefinitionList items={[
            ['Dossier', s.dossiers ? `${s.dossiers.reference} — ${s.dossiers.title}` : '—'],
            ['Module', label(activityLabels, s.activity)],
            ['Séjour', `${s.start_date ?? '?'} → ${s.end_date ?? '?'}`],
            ['Occupation', s.occupancy ?? `${s.dossiers?.adults ?? 1} adulte(s), ${s.dossiers?.children ?? 0} enfant(s)`],
            ['Hôtel prévu', s.hotels ? `${s.hotels.name} (${s.hotels.city})` : '—'],
            ['Chambre / pension', `${s.room_type ?? '—'} / ${s.board ?? '—'}`],
            ['Référence externe', s.external_ref ? `${s.external_provider} · ${s.external_ref}` : '—'],
            ['Prix de vente client', formatMoney(s.sale_price)],
            ...(session.can('margins', 'read') ? [['Coût prévu / confirmé', `${formatMoney(s.cost_planned)} / ${formatMoney(s.cost_confirmed)}`] as [string, string]] : []),
          ]} />
        </CardBody>
      </Card>
      {s.activity !== 'hotel_tn' ? <Alert tone="warning" className="mb-4">Les connecteurs API concernent les hôtels en Tunisie ; cette prestation relève du module « {label(activityLabels, s.activity)} ».</Alert> : null}
      {!canBook ? <Alert tone="info" className="mb-4">Consultation seule : la réservation nécessite le droit de modifier les dossiers.</Alert> : null}
      <HotelSearch
        hotels={(hotels ?? []).map((h) => ({ id: h.id, name: h.name, city: h.city }))}
        cities={cities}
        defaults={{ hotelId: s.hotel_id ?? undefined, city, checkIn, checkOut, adults: s.dossiers?.adults ?? 2, children: s.dossiers?.children ?? 0 }}
        serviceId={canBook ? s.id : undefined}
        existing={existing ? { id: existing.id, status: existing.status, connector: existing.connector_code, external_ref: existing.external_ref, last_error: existing.last_error, attempts: existing.attempts } : null}
        manualHref={s.dossiers ? `/dossiers/${s.dossiers.id}` : undefined}
      />
    </>
  )
}
