import Link from 'next/link'
import { ACTIVITIES, activityLabels, formatMoney, label, priceLabel, publicationStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Badge, Card, DateText, EmptyState, Input, Select, Stat, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader, Tabs } from '@/components/page'
import { requireStaff } from '@/lib/auth'
import { sp, type SearchParams } from '@/lib/fin/format'

export const metadata = { title: 'Offres' }

export default async function OffersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('site', 'read')
  const params = await searchParams
  const f = { status: sp(params.status), activity: sp(params.activity), q: sp(params.q) }
  const supabase = await createClient()
  let q = supabase.from('offers').select('id, slug, title, activity, is_omra, destination, price_amount, price_basis, deposit_amount, status, publish_at, unpublish_at, featured, updated_at').order('sort_order').order('updated_at', { ascending: false })
  if (f.status) q = q.eq('status', f.status as 'draft')
  if (f.activity) q = q.eq('activity', f.activity as 'hotel_tn')
  if (f.q) q = q.ilike('title', `%${f.q}%`)
  const [{ data: offers }, { data: all }, { data: deps }] = await Promise.all([
    q,
    supabase.from('offers').select('status'),
    supabase.from('departures').select('offer_id, start_date, status').eq('status', 'open'),
  ])
  const count = (s: string) => (all ?? []).filter((o) => o.status === s).length
  const today = new Date().toISOString().slice(0, 10)
  const nextDep = (id: string) => (deps ?? []).filter((d) => d.offer_id === id && d.start_date > today).map((d) => d.start_date).sort()[0]

  return (
    <>
      <PageHeader
        title="Offres et site internet"
        description="Catalogue publié sur le site : modèle de voyage, départs datés, publication contrôlée. Les coûts et marges ne sont jamais exposés."
        actions={session.can('site', 'create') ? <Link className={buttonClass('primary')} href="/site/offres/nouvelle">Nouvelle offre</Link> : null}
      />
      <Tabs current="/site/offres" tabs={[{ href: '/site/offres', label: 'Offres' }, { href: '/site/pages', label: 'Pages, redirections et coordonnées' }]} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(['draft', 'review', 'published', 'hidden', 'archived'] as const).map((s) => (
          <Stat key={s} label={publicationStatusLabels[s]} value={count(s)} href={`/site/offres?status=${s}`} tone={s === 'review' && count(s) ? 'warning' : 'neutral'} />
        ))}
      </div>
      <FilterBar>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-status">Statut</label>
          <Select id="f-status" name="status" defaultValue={f.status ?? ''} className="w-40">
            <option value="">Tous</option>{Object.entries(publicationStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-activity">Activité</label>
          <Select id="f-activity" name="activity" defaultValue={f.activity ?? ''} className="w-52">
            <option value="">Toutes</option>{ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
          </Select>
        </div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-q">Titre</label><Input id="f-q" name="q" defaultValue={f.q ?? ''} /></div>
      </FilterBar>
      <Card>
        {(offers ?? []).length === 0 ? <EmptyState title="Aucune offre" /> : (
          <Table>
            <thead><tr><Th>Offre</Th><Th>Activité</Th><Th>Statut</Th><Th>Prix affiché</Th><Th>Acompte</Th><Th>Prochain départ</Th><Th>Modifiée</Th></tr></thead>
            <tbody>
              {(offers ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-canvas/60">
                  <Td>
                    <Link className="font-medium text-brand-600 hover:underline" href={`/site/offres/${o.id}`}>{o.title}</Link>
                    <span className="block font-mono text-xs text-muted">/offres/{o.slug}</span>
                    {o.is_omra ? <Badge tone="accent" className="mr-1 mt-1">Omra</Badge> : null}
                    {o.featured ? <Badge tone="brand" className="mt-1">À la une</Badge> : null}
                  </Td>
                  <Td className="text-xs">{label(activityLabels, o.activity)}<span className="block text-muted">{o.destination}</span></Td>
                  <Td>
                    <StatusBadge status={o.status} labels={publicationStatusLabels} />
                    {o.publish_at && o.publish_at > new Date().toISOString() ? <span className="block text-xs text-muted">dès <DateText value={o.publish_at} /></span> : null}
                    {o.unpublish_at ? <span className="block text-xs text-muted">jusqu’au <DateText value={o.unpublish_at} /></span> : null}
                  </Td>
                  <Td className="text-sm">{o.price_amount != null ? <>{priceLabel(o.price_basis)} <span className="font-semibold tabular">{formatMoney(o.price_amount)}</span></> : <span className="text-warning-600">à renseigner</span>}</Td>
                  <Td className="text-sm tabular">{o.deposit_amount != null ? formatMoney(o.deposit_amount) : '—'}</Td>
                  <Td><DateText value={nextDep(o.id)} /></Td>
                  <Td><DateText value={o.updated_at} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
