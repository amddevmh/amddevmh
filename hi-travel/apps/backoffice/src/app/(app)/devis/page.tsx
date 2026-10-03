import Link from 'next/link'
import { ACTIVITIES, activityLabels, formatDateFr, label, quoteStatusLabels } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, Money, Select, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { nowMs } from '@/lib/ops/format'
import { db, getStaff, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'

export const metadata = { title: 'Devis' }

export default async function QuotesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('quotes')
  const params = await searchParams
  const status = sp(params, 'statut')
  const followUp = sp(params, 'relance') === '1'
  const activity = sp(params, 'activite')
  const owner = sp(params, 'responsable')
  const q = sp(params, 'q')
  const supabase = await db()

  let query = supabase.from('quotes').select('id, reference, title, status, activity, owner_id, created_at, lost_reason, clients(display_name), quote_versions(id, version_no, status, sent_at, valid_until)')
  if (status) query = query.eq('status', status as never)
  if (followUp) query = query.eq('status', 'sent')
  if (activity) query = query.eq('activity', activity as never)
  if (owner === 'moi') query = query.eq('owner_id', session.userId)
  else if (owner) query = query.eq('owner_id', owner)
  if (q) query = query.or(`reference.ilike.${ilikeValue(q)},title.ilike.${ilikeValue(q)}`)
  const [{ data, error }, staff] = await Promise.all([query.order('created_at', { ascending: false }).limit(300), getStaff()])
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const threshold = nowMs() - 3 * 86400_000
  const rows = (data ?? []).map((qt) => {
    const versions = [...(qt.quote_versions ?? [])].sort((a, b) => b.version_no - a.version_no)
    const latest = versions[0]
    const lastSent = versions.find((v) => v.sent_at)?.sent_at ?? null
    return { ...qt, latest, lastSent, needsFollowUp: qt.status === 'sent' && lastSent != null && new Date(lastSent).getTime() < threshold }
  }).filter((r) => !followUp || r.needsFollowUp)
  const versionIds = rows.map((r) => r.latest?.id).filter((x): x is string => !!x)
  const { data: totals } = versionIds.length ? await supabase.from('quote_version_totals').select('version_id, total_price').in('version_id', versionIds) : { data: [] }
  const totalMap = new Map((totals ?? []).map((t) => [t.version_id, t.total_price]))

  return (
    <>
      <PageHeader
        title="Devis"
        description="Devis versionnés : une version envoyée est figée ; l’acceptation crée le dossier sans ressaisie."
        actions={session.can('quotes', 'create') ? <Link href="/devis/nouveau" className={buttonClass('accent')}>Nouveau devis</Link> : null}
      />
      <FilterBar action="/devis">
        <FilterField label="Recherche"><FilterInput name="q" defaultValue={q} placeholder="Référence, intitulé" /></FilterField>
        <FilterField label="Statut">
          <Select name="statut" defaultValue={status ?? ''}>
            <option value="">Tous</option>
            {Object.entries(quoteStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Activité">
          <Select name="activite" defaultValue={activity ?? ''}>
            <option value="">Toutes</option>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Responsable">
          <Select name="responsable" defaultValue={owner ?? ''}>
            <option value="">Tous</option><option value="moi">Moi</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </FilterField>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="relance" value="1" defaultChecked={followUp} className="size-4" /> À relancer (envoyés depuis + de 3 jours)</label>
        <ResetLink href="/devis" />
      </FilterBar>
      <Card>
        <CardHeader title={`${rows.length} devis`} description={error ? `Erreur : ${error.message}` : undefined} />
        <CardBody>
          {!rows.length ? <EmptyState title="Aucun devis" /> : (
            <Table className="-mx-5">
              <thead><tr><Th>Référence</Th><Th>Client</Th><Th>Activité</Th><Th>Dernière version</Th><Th className="text-right">Total client</Th><Th>Statut</Th><Th>Responsable</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/devis/${r.id}`} className="font-medium text-brand-600 hover:underline">{r.reference}</Link>
                      <p className="text-xs text-muted">{r.title}</p>
                    </Td>
                    <Td>{(r.clients as { display_name?: string } | null)?.display_name}</Td>
                    <Td>{label(activityLabels, r.activity)}</Td>
                    <Td className="text-xs">
                      {r.latest ? <>v{r.latest.version_no} — {label(quoteStatusLabels, r.latest.status)}</> : '—'}
                      {r.lastSent ? <p className="text-muted">Envoyé le {formatDateFr(r.lastSent)}</p> : null}
                      {r.latest?.valid_until ? <p className="text-muted">Valable jusqu’au {formatDateFr(r.latest.valid_until)}</p> : null}
                    </Td>
                    <Td className="text-right">{r.latest ? <Money value={totalMap.get(r.latest.id)} /> : '—'}</Td>
                    <Td>
                      <StatusBadge status={r.status} labels={quoteStatusLabels} />
                      {r.needsFollowUp ? <p className="mt-1"><Badge tone="warning">À relancer</Badge></p> : null}
                      {r.lost_reason ? <p className="text-xs text-muted">{r.lost_reason}</p> : null}
                    </Td>
                    <Td>{r.owner_id ? names.get(r.owner_id) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  )
}
