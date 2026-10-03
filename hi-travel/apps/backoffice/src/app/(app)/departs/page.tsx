import Link from 'next/link'
import { formatDateFr, label, activityLabels } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, Money, Select, Table, Td, Th } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { expireOptionsNow } from '@/lib/ops/actions/departures'
import { db, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'
import { todayIso, nowMs } from '@/lib/ops/format'
import { departureStatusLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Départs et groupes' }

export default async function DeparturesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('departures')
  const params = await searchParams
  const period = sp(params, 'periode') ?? 'avenir'
  const status = sp(params, 'statut')
  const q = sp(params, 'q')
  const supabase = await db()
  let query = supabase.from('departures').select('id, code, start_date, end_date, capacity, seats_confirmed, seats_on_option, status, booking_deadline, supplier_option_deadline, min_participants, price_adult, currency, offers(id, title, activity, is_omra)')
  if (period === 'avenir') query = query.gte('end_date', todayIso())
  if (period === 'passes') query = query.lt('end_date', todayIso())
  if (status) query = query.eq('status', status as never)
  if (q) query = query.ilike('code', ilikeValue(q))
  const [{ data, error }, { data: holds }] = await Promise.all([
    query.order('start_date', { ascending: period !== 'passes' }).limit(200),
    supabase.from('departure_holds').select('departure_id, expires_at').eq('status', 'active').eq('kind', 'option'),
  ])
  const now = nowMs()
  const expiredByDep = new Map<string, number>()
  for (const h of holds ?? []) if (h.expires_at && Date.parse(h.expires_at) < now) expiredByDep.set(h.departure_id, (expiredByDep.get(h.departure_id) ?? 0) + 1)
  const expiredTotal = [...expiredByDep.values()].reduce((a, b) => a + b, 0)

  return (
    <>
      <PageHeader
        title="Départs et groupes"
        description="Un départ par ligne : capacité, places confirmées, options temporaires et disponibilités. La survente est bloquée par la base, y compris en cas de réservations simultanées."
        actions={session.can('departures', 'update') ? (
          <OpsForm action={expireOptionsNow} inline>
            <OpsSubmit variant={expiredTotal ? 'accent' : 'secondary'} size="sm" confirm="Expirer maintenant les options dont la date limite est dépassée ?">Expirer les options échues{expiredTotal ? ` (${expiredTotal})` : ''}</OpsSubmit>
          </OpsForm>
        ) : null}
      />
      <FilterBar action="/departs">
        <FilterField label="Code"><FilterInput name="q" defaultValue={q} placeholder="IST-2026…" /></FilterField>
        <FilterField label="Période">
          <Select name="periode" defaultValue={period}><option value="avenir">À venir / en cours</option><option value="passes">Passés</option><option value="tous">Tous</option></Select>
        </FilterField>
        <FilterField label="Statut">
          <Select name="statut" defaultValue={status ?? ''}><option value="">Tous</option>{Object.entries(departureStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </FilterField>
        <ResetLink href="/departs" />
      </FilterBar>
      <Card>
        <CardHeader title={`${data?.length ?? 0} départ(s)`} description={error ? `Erreur : ${error.message}` : undefined} />
        <CardBody>
          {!data?.length ? <EmptyState title="Aucun départ" /> : (
            <Table className="-mx-5">
              <thead><tr><Th>Départ</Th><Th>Dates</Th><Th className="text-right">Capacité</Th><Th className="text-right">Confirmées</Th><Th className="text-right">Options</Th><Th className="text-right">Disponibles</Th><Th>Limites</Th><Th className="text-right">Prix adulte</Th></tr></thead>
              <tbody>
                {data.map((d) => {
                  const o = d.offers as { title: string; activity: string; is_omra: boolean } | null
                  const avail = d.capacity - d.seats_confirmed - d.seats_on_option
                  return (
                    <tr key={d.id}>
                      <Td>
                        <Link href={`/departs/${d.id}`} className="font-medium text-brand-600 hover:underline">{d.code}</Link>
                        <p className="text-xs text-muted">{o?.title} · {label(activityLabels, o?.activity)} {o?.is_omra ? <Badge tone="accent">Omra</Badge> : null}</p>
                        {d.status !== 'open' ? <Badge tone="neutral">{label(departureStatusLabels, d.status)}</Badge> : null}
                      </Td>
                      <Td className="whitespace-nowrap">{formatDateFr(d.start_date)} → {formatDateFr(d.end_date)}</Td>
                      <Td className="text-right">{d.capacity}</Td>
                      <Td className="text-right">{d.seats_confirmed}{d.min_participants && d.seats_confirmed < d.min_participants ? <p className="text-xs text-warning-600">min. {d.min_participants}</p> : null}</Td>
                      <Td className="text-right">{d.seats_on_option}{expiredByDep.get(d.id) ? <p><Badge tone="danger">{expiredByDep.get(d.id)} échue(s)</Badge></p> : null}</Td>
                      <Td className="text-right"><Badge tone={avail <= 0 ? 'danger' : avail < 5 ? 'warning' : 'success'}>{avail <= 0 ? 'Complet' : avail}</Badge></Td>
                      <Td className="text-xs">Réservation : {formatDateFr(d.booking_deadline)}<br />Option fournisseur : {formatDateFr(d.supplier_option_deadline)}</Td>
                      <Td className="text-right"><Money value={d.price_adult} currency={d.currency} /></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  )
}
