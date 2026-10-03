import Link from 'next/link'
import { ACTIVITIES, activityLabels, formatDateFr, label, leadSourceLabels, leadStageLabels } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, Select, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, getStaff, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'

export const metadata = { title: 'Demandes' }

const STAGES = ['received', 'qualification', 'quote', 'follow_up', 'won', 'lost'] as const

function contactName(l: { contact_snapshot: unknown; clients: { display_name: string | null } | null }) {
  if (l.clients?.display_name) return l.clients.display_name
  const c = (l.contact_snapshot ?? {}) as Record<string, string | null>
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || c.email || c.phone || '—'
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('crm')
  const params = await searchParams
  const view = sp(params, 'vue') ?? 'liste'
  const stage = sp(params, 'etape')
  const owner = sp(params, 'responsable')
  const activity = sp(params, 'activite')
  const q = sp(params, 'q')

  const supabase = await db()
  let query = supabase.from('leads').select('id, reference, activity, stage, source, owner_id, destination, date_from, date_to, adults, children, next_action, next_action_at, created_at, contact_snapshot, possible_duplicate_client_ids, client_id, lost_reason, clients(display_name)')
  if (stage) query = query.eq('stage', stage as never)
  else if (view === 'liste') query = query.not('stage', 'in', '(won,lost)')
  if (owner === 'aucun') query = query.is('owner_id', null)
  else if (owner === 'moi') query = query.eq('owner_id', session.userId)
  else if (owner) query = query.eq('owner_id', owner)
  if (activity) query = query.eq('activity', activity as never)
  if (q) query = query.or(`reference.ilike.${ilikeValue(q)},destination.ilike.${ilikeValue(q)},message.ilike.${ilikeValue(q)}`)
  const [{ data: leads, error }, staff] = await Promise.all([query.order('created_at', { ascending: false }).limit(300), getStaff()])
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const rows = leads ?? []

  const qs = (v: string) => {
    const p = new URLSearchParams()
    for (const [k, val] of Object.entries(params)) if (typeof val === 'string' && k !== 'vue') p.set(k, val)
    p.set('vue', v)
    return `/crm/demandes?${p.toString()}`
  }

  return (
    <>
      <PageHeader
        title="Demandes"
        description="Pipeline commercial : demandes du site, téléphone, agence… Les doublons possibles sont signalés, jamais fusionnés automatiquement."
        breadcrumbs={[{ href: '/crm/demandes', label: 'Clients et entreprises' }]}
        actions={
          <>
            <Link href={qs('liste')} className={buttonClass(view === 'liste' ? 'primary' : 'secondary', 'sm')}>Liste</Link>
            <Link href={qs('pipeline')} className={buttonClass(view === 'pipeline' ? 'primary' : 'secondary', 'sm')}>Pipeline</Link>
            {session.can('crm', 'create') ? <Link href="/crm/demandes/nouvelle" className={buttonClass('accent', 'sm')}>Nouvelle demande</Link> : null}
          </>
        }
      />
      <FilterBar action="/crm/demandes">
        <input type="hidden" name="vue" value={view} />
        <FilterField label="Recherche"><FilterInput name="q" defaultValue={q} placeholder="Référence, destination…" /></FilterField>
        <FilterField label="Étape">
          <Select name="etape" defaultValue={stage ?? ''}>
            <option value="">{view === 'liste' ? 'En cours' : 'Toutes'}</option>
            {STAGES.map((s) => <option key={s} value={s}>{leadStageLabels[s]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Responsable">
          <Select name="responsable" defaultValue={owner ?? ''}>
            <option value="">Tous</option>
            <option value="moi">Moi</option>
            <option value="aucun">Sans responsable</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Activité">
          <Select name="activite" defaultValue={activity ?? ''}>
            <option value="">Toutes</option>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
          </Select>
        </FilterField>
        <ResetLink href={`/crm/demandes?vue=${view}`} />
      </FilterBar>

      {error ? <p className="mb-3 text-sm text-danger-700">Erreur : {error.message}</p> : null}

      {view === 'pipeline' ? (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
          {STAGES.filter((s) => !stage || s === stage).map((s) => {
            const col = rows.filter((l) => l.stage === s)
            return (
              <section key={s} className="min-w-56 rounded-card border border-line bg-canvas p-2">
                <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-brand-900">
                  {leadStageLabels[s]} <Badge>{col.length}</Badge>
                </h2>
                <ul className="space-y-2">
                  {col.slice(0, 40).map((l) => (
                    <li key={l.id}>
                      <Link href={`/crm/demandes/${l.id}`} className="block rounded-lg border border-line bg-white p-2.5 text-sm hover:border-brand-300">
                        <p className="flex items-center justify-between gap-2 text-xs text-muted"><span>{l.reference}</span><span>{formatDateFr(l.created_at)}</span></p>
                        <p className="font-medium text-ink">{contactName(l)}</p>
                        <p className="text-xs text-muted">{label(activityLabels, l.activity)}{l.destination ? ` — ${l.destination}` : ''}</p>
                        <p className="mt-1 flex flex-wrap gap-1">
                          {!l.owner_id ? <Badge tone="danger">Sans responsable</Badge> : <Badge>{names.get(l.owner_id)}</Badge>}
                          {l.possible_duplicate_client_ids.length ? <Badge tone="warning">Doublon possible</Badge> : null}
                        </p>
                        {l.next_action ? <p className="mt-1 text-xs text-brand-700">→ {l.next_action}</p> : null}
                      </Link>
                    </li>
                  ))}
                  {col.length === 0 ? <li className="px-1 text-xs text-muted">Aucune demande</li> : null}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardHeader title={`${rows.length} demande(s)`} />
          <CardBody>
            {rows.length === 0 ? <EmptyState title="Aucune demande" description="Aucune demande ne correspond à ces critères." /> : (
              <Table className="-mx-5">
                <thead>
                  <tr><Th>Référence</Th><Th>Client / contact</Th><Th>Activité</Th><Th>Voyage</Th><Th>Étape</Th><Th>Responsable</Th><Th>Prochaine action</Th></tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <Td>
                        <Link href={`/crm/demandes/${l.id}`} className="font-medium text-brand-600 hover:underline">{l.reference}</Link>
                        <p className="text-xs text-muted">{formatDateFr(l.created_at)} · {label(leadSourceLabels, l.source)}</p>
                      </Td>
                      <Td>
                        {contactName(l)}
                        {l.possible_duplicate_client_ids.length ? <p><Badge tone="warning">Doublon possible</Badge></p> : null}
                        {!l.client_id && !l.possible_duplicate_client_ids.length ? <p className="text-xs text-muted">Sans fiche client</p> : null}
                      </Td>
                      <Td>{label(activityLabels, l.activity)}</Td>
                      <Td>
                        {l.destination ?? '—'}
                        <p className="text-xs text-muted">{l.date_from ? `${formatDateFr(l.date_from)}${l.date_to ? ` → ${formatDateFr(l.date_to)}` : ''}` : 'Dates à préciser'} · {l.adults} ad.{l.children ? ` + ${l.children} enf.` : ''}</p>
                      </Td>
                      <Td><StatusBadge status={l.stage === 'received' ? 'received_lead' : l.stage} labels={{ ...leadStageLabels, received_lead: leadStageLabels.received! }} /></Td>
                      <Td>{l.owner_id ? names.get(l.owner_id) : <Badge tone="danger">À attribuer</Badge>}</Td>
                      <Td className="text-xs">{l.next_action ?? '—'}{l.next_action_at ? <p className="text-muted">{formatDateFr(l.next_action_at)}</p> : null}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}
    </>
  )
}
