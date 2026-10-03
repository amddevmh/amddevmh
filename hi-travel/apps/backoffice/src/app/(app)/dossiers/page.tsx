import Link from 'next/link'
import { ACTIVITIES, activityLabels, dossierStatusLabels, formatDateFr, label } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, Money, Select, StatusBadge, Table, Td, Th } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, getStaff, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'
import { addDaysIso, todayIso } from '@/lib/ops/format'
import { financialStatusLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Dossiers' }

const STATUSES = Object.keys(dossierStatusLabels)

export default async function DossiersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('dossiers')
  const params = await searchParams
  const status = sp(params, 'statut')
  const activity = sp(params, 'activite')
  const owner = sp(params, 'responsable')
  const from = sp(params, 'depart_du')
  const to = sp(params, 'depart_au')
  const q = sp(params, 'q')
  const missingDocs = sp(params, 'pieces') === 'manquantes'
  const overdue = sp(params, 'impayes') === '1'
  const dueSoon = sp(params, 'echeances')
  const supabase = await db()

  // Filtres « indicateurs » du tableau de bord : on restreint à une liste d’identifiants
  let restrictIds: string[] | null = null
  const intersect = (ids: string[]) => { restrictIds = restrictIds ? restrictIds.filter((x) => ids.includes(x)) : ids }
  if (missingDocs) {
    const { data } = await supabase.from('dossier_checks').select('dossier_id').like('code', 'doc:%').in('status', ['to_complete', 'blocking'])
    intersect([...new Set((data ?? []).map((d) => d.dossier_id))])
  }
  if (overdue) {
    const { data } = await supabase.from('dossier_financials').select('dossier_id').gt('overdue', 0)
    intersect((data ?? []).map((d) => d.dossier_id).filter((x): x is string => !!x))
  }
  if (dueSoon) {
    const { data } = await supabase.from('payment_schedule_items').select('dossier_id').gte('due_date', todayIso()).lte('due_date', addDaysIso(todayIso(), Number(dueSoon) || 7))
    intersect([...new Set((data ?? []).map((d) => d.dossier_id))])
  }
  let clientIds: string[] = []
  if (q) {
    const { data } = await supabase.from('clients').select('id').ilike('display_name', ilikeValue(q)).limit(50)
    clientIds = (data ?? []).map((c) => c.id)
  }

  let query = supabase.from('dossiers').select('id, reference, title, status, activity, start_date, end_date, owner_id, financial_status, destination, derogation_reason, clients(display_name)')
  if (status) query = query.in('status', status.split(',').filter((s) => STATUSES.includes(s)) as never[])
  if (activity) query = query.eq('activity', activity as never)
  if (owner === 'moi') query = query.eq('owner_id', session.userId)
  else if (owner === 'aucun') query = query.is('owner_id', null)
  else if (owner) query = query.eq('owner_id', owner)
  if (from) query = query.gte('start_date', from)
  if (to) query = query.lte('start_date', to)
  if (q) query = query.or([`reference.ilike.${ilikeValue(q)}`, `title.ilike.${ilikeValue(q)}`, `destination.ilike.${ilikeValue(q)}`, clientIds.length ? `client_id.in.(${clientIds.join(',')})` : null].filter(Boolean).join(','))
  if (restrictIds) query = query.in('id', (restrictIds as string[]).length ? restrictIds : ['00000000-0000-0000-0000-000000000000'])
  const [{ data: dossiers, error }, staff] = await Promise.all([query.order('start_date', { ascending: true, nullsFirst: false }).limit(300), getStaff()])
  const ids = (dossiers ?? []).map((d) => d.id)
  const { data: fin } = ids.length ? await supabase.from('dossier_financials').select('dossier_id, sale_net, paid, balance, overdue').in('dossier_id', ids) : { data: [] }
  const finMap = new Map((fin ?? []).map((f) => [f.dossier_id, f]))
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const special = [missingDocs && 'pièces manquantes', overdue && 'impayés échus', dueSoon && `échéances clients sous ${dueSoon} jours`].filter(Boolean)

  return (
    <>
      <PageHeader title="Dossiers" description="Fiche dossier unique : prestations par module, voyageurs, paiements, documents et contrôles." breadcrumbs={[{ href: '/devis', label: 'Devis et dossiers' }]} />
      <FilterBar action="/dossiers">
        <FilterField label="Référence / client"><FilterInput name="q" defaultValue={q} placeholder="DOS-…, nom du client, destination" /></FilterField>
        <FilterField label="Statut">
          <Select name="statut" defaultValue={status ?? ''}>
            <option value="">Tous</option>
            <option value="accepted,booking,confirmed">En cours (accepté → confirmé)</option>
            {STATUSES.map((s) => <option key={s} value={s}>{dossierStatusLabels[s]}</option>)}
            {status && !STATUSES.includes(status) && status !== 'accepted,booking,confirmed' ? <option value={status}>{status.split(',').map((s) => dossierStatusLabels[s]).join(', ')}</option> : null}
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
            <option value="">Tous</option><option value="moi">Moi</option><option value="aucun">Sans responsable</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Départ du"><FilterInput type="date" name="depart_du" defaultValue={from} /></FilterField>
        <FilterField label="au"><FilterInput type="date" name="depart_au" defaultValue={to} /></FilterField>
        {missingDocs ? <input type="hidden" name="pieces" value="manquantes" /> : null}
        {overdue ? <input type="hidden" name="impayes" value="1" /> : null}
        {dueSoon ? <input type="hidden" name="echeances" value={dueSoon} /> : null}
        <ResetLink href="/dossiers" />
      </FilterBar>
      {special.length ? <p className="mb-3 text-sm">Filtre indicateur : <Badge tone="warning">{special.join(' + ')}</Badge> <Link href="/dossiers" className="ml-2 text-brand-600 hover:underline">retirer</Link></p> : null}
      <Card>
        <CardHeader title={`${dossiers?.length ?? 0} dossier(s)`} description={error ? `Erreur : ${error.message}` : undefined} />
        <CardBody>
          {!dossiers?.length ? <EmptyState title="Aucun dossier" description="Aucun dossier ne correspond aux critères." /> : (
            <Table className="-mx-5">
              <thead><tr><Th>Dossier</Th><Th>Client</Th><Th>Activité</Th><Th>Voyage</Th><Th>Statut</Th><Th className="text-right">Encaissé / solde</Th><Th>Responsable</Th></tr></thead>
              <tbody>
                {dossiers.map((d) => {
                  const f = finMap.get(d.id)
                  return (
                    <tr key={d.id}>
                      <Td>
                        <Link href={`/dossiers/${d.id}`} className="font-medium text-brand-600 hover:underline">{d.reference}</Link>
                        <p className="max-w-64 truncate text-xs text-muted">{d.title}</p>
                      </Td>
                      <Td>{(d.clients as { display_name?: string } | null)?.display_name}</Td>
                      <Td>{label(activityLabels, d.activity)}</Td>
                      <Td className="whitespace-nowrap">{formatDateFr(d.start_date)}<p className="text-xs text-muted">→ {formatDateFr(d.end_date)}{d.destination ? ` · ${d.destination}` : ''}</p></Td>
                      <Td>
                        <StatusBadge status={d.status} labels={dossierStatusLabels} />
                        {d.derogation_reason ? <p><Badge tone="warning">Dérogation</Badge></p> : null}
                        {d.financial_status !== 'open' ? <p className="text-xs text-muted">{label(financialStatusLabels, d.financial_status)}</p> : null}
                      </Td>
                      <Td className="text-right">
                        {f ? <><Money value={f.paid} /><p className="text-xs text-muted">solde <Money value={f.balance} /></p>{Number(f.overdue) > 0 ? <Badge tone="danger">Échu <Money value={f.overdue} /></Badge> : null}</> : '—'}
                      </Td>
                      <Td>{d.owner_id ? names.get(d.owner_id) : <Badge tone="warning">—</Badge>}</Td>
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
