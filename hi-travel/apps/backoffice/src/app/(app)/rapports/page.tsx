import Link from 'next/link'
import { activityLabels, dossierStatusLabels, formatMoney, label } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, CardHeader, DateText, EmptyState, Input, Stat, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader, Tabs } from '@/components/page'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { firstDayOfYear, n, sp, type SearchParams } from '@/lib/fin/format'
import { departureResults, dossierRows } from '@/lib/fin/reports'

export const metadata = { title: 'Rapports' }

const DIMS = { activity: 'Par activité', owner: 'Par responsable', destination: 'Par destination' } as const
type Dim = keyof typeof DIMS

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('reports', 'read')
  const params = await searchParams
  const from = sp(params.from) ?? firstDayOfYear()
  const to = sp(params.to) ?? `${from.slice(0, 4)}-12-31`
  const dim = (sp(params.dim) as Dim) in DIMS ? (sp(params.dim) as Dim) : 'activity'
  const filters = { from, to, activity: sp(params.activity), owner: sp(params.owner), destination: sp(params.destination) }
  const margins = session.can('margins', 'read')
  const supabase = await createClient()

  const [{ data: kpis, error }, rows] = await Promise.all([
    supabase.rpc('management_kpis', { p_from: from, p_to: to }),
    dossierRows(supabase, filters),
  ])
  const departures = await departureResults(supabase, rows)
  const kpiRows = (kpis ?? []).filter((k) => k.dimension === dim)
  const sum = (k: 'sales_planned' | 'invoiced_net' | 'collected' | 'cost_planned' | 'margin_forecast') => kpiRows.reduce((a, r) => a + n(r[k]), 0)
  const provisional = kpiRows.reduce((a, r) => a + Number(r.provisional_count ?? 0), 0)
  const base = new URLSearchParams({ from, to, dim })
  const href = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams(base)
    for (const [k, v] of Object.entries(patch)) if (v) u.set(k, v)
    return `/rapports?${u.toString()}#dossiers`
  }
  const keyLabel = (key: string | null) => (dim === 'activity' ? label(activityLabels, key) : key ?? '—')
  const activeFilter = filters.activity ? label(activityLabels, filters.activity) : filters.owner ?? filters.destination

  return (
    <>
      <PageHeader
        title="Rapports de gestion"
        description="Indicateurs FIN07 : ventes prévues, facturation nette des avoirs, règlements reçus et coûts sont présentés séparément. Un encaissement n’est ni du chiffre d’affaires ni une marge."
        actions={session.can('reports', 'export') ? <a className={buttonClass('secondary')} href={`/api/exports/rapports?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString()}`}>Exporter CSV</a> : null}
      />
      <FilterBar>
        <input type="hidden" name="dim" value={dim} />
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-from">Départs du</label><Input id="f-from" type="date" name="from" defaultValue={from} /></div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-to">au</label><Input id="f-to" type="date" name="to" defaultValue={to} /></div>
      </FilterBar>
      {error ? <Alert tone="danger" className="mb-4">{error.message}</Alert> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Ventes prévues nettes" value={formatMoney(sum('sales_planned'))} hint="Prix des dossiers − avoirs, TTC" href="#dossiers" />
        <Stat label="Facturation nette" value={formatMoney(sum('invoiced_net'))} hint="Factures validées − avoirs (hors pro formas)" href="/finances/factures?kind=invoice&status=validated" />
        <Stat label="Règlements reçus (validés)" value={formatMoney(sum('collected'))} hint="Trésorerie, pas un chiffre d’affaires" href="/finances/reglements?status=validated&direction=in" />
        {margins ? <Stat label="Coûts prévus convertis" value={formatMoney(sum('cost_planned'))} hint="Devises au taux daté de chaque prestation" /> : null}
        {margins ? <Stat label="Marge prévisionnelle" value={formatMoney(sum('margin_forecast'))} hint={provisional ? `${provisional} dossier(s) provisoire(s) — coûts incomplets` : 'Coûts renseignés'} tone={provisional ? 'warning' : 'success'} /> : null}
      </div>
      {!margins ? <Alert tone="info" className="mb-5">Les coûts et marges ne sont pas affichés pour votre profil.</Alert> : null}

      <Tabs current={`/rapports?${base.toString()}`} tabs={(Object.keys(DIMS) as Dim[]).map((d) => ({ href: `/rapports?${new URLSearchParams({ from, to, dim: d }).toString()}`, label: DIMS[d] }))} />
      <Card className="mb-6">
        {kpiRows.length === 0 ? <EmptyState title="Aucun dossier sur la période" description="Les indicateurs portent sur les dossiers dont le départ est dans la période (hors annulés)." /> : (
          <Table>
            <thead>
              <tr>
                <Th>{DIMS[dim].replace('Par ', '').replace(/^./, (c) => c.toUpperCase())}</Th>
                <Th className="text-right">Ventes prévues</Th>
                <Th className="text-right">Facturé net</Th>
                <Th className="text-right">Réglé (validé)</Th>
                {margins ? <><Th className="text-right">Coûts prévus</Th><Th className="text-right">Marge prév.</Th></> : null}
                <Th className="text-right">Provisoires</Th>
              </tr>
            </thead>
            <tbody>
              {kpiRows.map((k) => (
                <tr key={`${k.dimension}:${k.key}`}>
                  <Td><Link className="text-brand-600 hover:underline" href={href({ [dim]: k.key ?? '—' })}>{keyLabel(k.key)}</Link></Td>
                  <MoneyTd value={k.sales_planned} />
                  <MoneyTd value={k.invoiced_net} />
                  <MoneyTd value={k.collected} />
                  {margins ? <><MoneyTd value={k.cost_planned} /><MoneyTd value={k.margin_forecast} strong /></> : null}
                  <Td className="text-right">{Number(k.provisional_count) ? <Badge tone="warning">{k.provisional_count}</Badge> : '0'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mb-6" >
        <div id="dossiers" />
        <CardHeader
          title="Rentabilité par dossier"
          description={activeFilter ? <>Filtre : <strong>{activeFilter}</strong> — <Link className="text-brand-600 hover:underline" href={`/rapports?${base.toString()}#dossiers`}>retirer</Link></> : 'Dossiers dont le départ est dans la période.'}
        />
        {rows.length === 0 ? <EmptyState title="Aucun dossier" /> : (
          <Table>
            <thead>
              <tr>
                <Th>Dossier</Th><Th>Client</Th><Th>Activité</Th><Th>Départ</Th><Th>Statut</Th>
                <Th className="text-right">Vente nette</Th><Th className="text-right">Facturé net</Th><Th className="text-right">Réglé</Th>
                {margins ? <><Th className="text-right">Coût prévu</Th><Th className="text-right">Coût réel</Th><Th className="text-right">Marge prév.</Th><Th className="text-right">Marge réelle</Th><Th>État de la marge</Th></> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dossier_id}>
                  <Td className="whitespace-nowrap"><Link className="text-brand-600 hover:underline" href={`/dossiers/${r.dossier_id}`}>{r.reference}</Link></Td>
                  <Td className="text-sm">{r.meta?.clients?.display_name}</Td>
                  <Td className="text-xs">{label(activityLabels, r.activity)}</Td>
                  <Td><DateText value={r.start_date} /></Td>
                  <Td><StatusBadge status={r.status} labels={dossierStatusLabels} /></Td>
                  <MoneyTd value={r.sale_net} />
                  <MoneyTd value={r.invoiced_net} />
                  <MoneyTd value={r.paid} />
                  {margins ? (
                    <>
                      <MoneyTd value={r.cost_planned} />
                      <MoneyTd value={r.cost_actual} />
                      <MoneyTd value={r.margin_forecast} />
                      <MoneyTd value={r.margin_state === 'final' ? r.margin_actual : null} />
                      <Td>{r.margin_state === 'final' ? <Badge tone="success">Définitive</Badge> : <Badge tone="warning">Provisoire, coûts incomplets</Badge>}</Td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Résultats par départ / groupe" description="Résultat de gestion, pas un bilan légal. Somme des dossiers rattachés et des coûts communs ventilés sur le départ." />
        {departures.length === 0 ? <EmptyState title="Aucun départ" description="Aucun dossier de la période n’est rattaché à un départ." /> : (
          <Table>
            <thead>
              <tr>
                <Th>Départ</Th><Th>Date</Th><Th className="text-right">Dossiers</Th><Th className="text-right">Places</Th>
                <Th className="text-right">Ventes nettes</Th><Th className="text-right">Facturé net</Th><Th className="text-right">Réglé</Th>
                {margins ? <><Th className="text-right">Coûts communs</Th><Th className="text-right">Coûts réels</Th><Th className="text-right">Résultat prév.</Th><Th className="text-right">Résultat réel</Th></> : null}
              </tr>
            </thead>
            <tbody>
              {departures.map((d) => (
                <tr key={d.id}>
                  <Td><span className="whitespace-nowrap font-medium">{d.code}</span><span className="block text-xs text-muted">{d.title}</span></Td>
                  <Td><DateText value={d.start_date} /></Td>
                  <Td className="text-right">{d.dossiers}</Td>
                  <Td className="text-right">{d.seats}/{d.capacity}</Td>
                  <MoneyTd value={d.sale_net} /><MoneyTd value={d.invoiced_net} /><MoneyTd value={d.paid} />
                  {margins ? (
                    <>
                      <MoneyTd value={d.common_cost} /><MoneyTd value={d.cost_actual} /><MoneyTd value={d.result_forecast} />
                      <Td className="text-right">{d.provisional ? <Badge tone="warning">Provisoire, coûts incomplets</Badge> : formatMoney(d.result_actual)}</Td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
