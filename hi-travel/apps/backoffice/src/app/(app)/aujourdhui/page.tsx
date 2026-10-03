import Link from 'next/link'
import { ACTIVITIES, activityLabels, taskStatusLabels } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, Select, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { TaskTable, type TaskRow } from '@/components/ops/task-table'
import { FilterField, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { addDaysIso, todayIso } from '@/lib/ops/format'
import { db, getStaff, sp, type SearchParams } from '@/lib/ops/data'
import { OPEN_TASK_STATUSES } from '@/lib/ops/labels'

export const metadata = { title: 'À traiter aujourd’hui' }

const RANK = (t: TaskRow) => (t.priority_rank ?? 9) * 1e13 + (t.due_at ? new Date(t.due_at).getTime() : 9e12)

export default async function TodayPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('tasks')
  const params = await searchParams
  const isLead = session.profile.role === 'direction' || session.can('tasks', 'validate')
  const view = sp(params, 'vue') ?? (isLead ? 'equipe' : 'moi')
  const activity = sp(params, 'activite')
  const assignee = sp(params, 'responsable')
  const status = sp(params, 'etat')
  const departure = sp(params, 'depart')

  const supabase = await db()
  let q = supabase.from('task_board').select('*').in('status', status ? [status as TaskRow['status'] & string] : [...OPEN_TASK_STATUSES])
  if (activity) q = q.eq('activity', activity as never)
  if (assignee === 'aucun') q = q.is('assignee_id', null)
  else if (assignee) q = q.eq('assignee_id', assignee)
  if (departure) q = q.lte('dossier_start_date', addDaysIso(todayIso(), Number(departure))).gte('dossier_start_date', todayIso())
  const [{ data: rows }, staff, { data: myDossiers }] = await Promise.all([
    q.order('priority_rank').order('due_at', { nullsFirst: false }).limit(500),
    getStaff(),
    supabase.from('dossiers').select('id').eq('owner_id', session.userId).not('status', 'in', '(cancelled,archived)'),
  ])
  const all = (rows ?? []).sort((a, b) => RANK(a) - RANK(b))
  const myDossierIds = new Set((myDossiers ?? []).map((d) => d.id))

  const mine = all.filter((t) => t.assignee_id === session.userId)
  const blocked = all.filter((t) => ['blocked', 'waiting_client', 'waiting_supplier'].includes(t.status ?? '')
    && (view === 'equipe' || t.assignee_id === session.userId || (t.dossier_id && myDossierIds.has(t.dossier_id))))
  const shared = all.filter((t) => t.dossier_id && myDossierIds.has(t.dossier_id) && t.assignee_id !== session.userId)
  const unassigned = all.filter((t) => !t.assignee_id)

  const serviceIds = [...new Set(all.map((t) => t.service_id).filter((x): x is string => !!x))]
  const { data: services } = serviceIds.length
    ? await supabase.from('services').select('id, description').in('id', serviceIds)
    : { data: [] as Array<{ id: string; description: string }> }
  const serviceMap = new Map((services ?? []).map((s) => [s.id, s.description]))

  // Charge par personne (surcharges visibles pour la direction)
  const load = new Map<string, { name: string; total: number; red: number; orange: number; overdue: number; waiting: number }>()
  for (const t of all) {
    const key = t.assignee_id ?? 'none'
    const cur = load.get(key) ?? { name: t.assignee_name ?? 'Non attribuées', total: 0, red: 0, orange: 0, overdue: 0, waiting: 0 }
    cur.total++
    if (t.priority === 'red') cur.red++
    if (t.priority === 'orange') cur.orange++
    if (t.due_at && new Date(t.due_at) < new Date()) cur.overdue++
    if (['blocked', 'waiting_client', 'waiting_supplier'].includes(t.status ?? '')) cur.waiting++
    load.set(key, cur)
  }

  const canReassign = session.can('tasks', 'update')
  const tableProps = { staff, services: serviceMap, canReassign, userId: session.userId }
  const qs = (v: string) => {
    const p = new URLSearchParams()
    for (const [k, val] of Object.entries(params)) if (typeof val === 'string' && k !== 'vue') p.set(k, val)
    p.set('vue', v)
    return `/aujourdhui?${p.toString()}`
  }

  return (
    <>
      <PageHeader
        title="À traiter aujourd’hui"
        description="Tâches classées par priorité expliquée : rouge = intervention immédiate, orange = aujourd’hui ou risque approchant, planifié = sans risque identifié."
        actions={
          <>
            <Link href={qs('moi')} className={buttonClass(view === 'moi' ? 'primary' : 'secondary', 'sm')}>Ma vue</Link>
            {isLead ? <Link href={qs('equipe')} className={buttonClass(view === 'equipe' ? 'primary' : 'secondary', 'sm')}>Vue d’équipe</Link> : null}
            <Link href="/taches" className={buttonClass('ghost', 'sm')}>Toutes les tâches</Link>
          </>
        }
      />

      <FilterBar>
        <input type="hidden" name="vue" value={view} />
        <FilterField label="Activité">
          <Select name="activite" defaultValue={activity ?? ''}>
            <option value="">Toutes</option>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Responsable">
          <Select name="responsable" defaultValue={assignee ?? ''}>
            <option value="">Tous</option>
            <option value="aucun">Non attribuées</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </FilterField>
        <FilterField label="État">
          <Select name="etat" defaultValue={status ?? ''}>
            <option value="">Ouvertes</option>
            {OPEN_TASK_STATUSES.map((s) => <option key={s} value={s}>{taskStatusLabels[s]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Départ">
          <Select name="depart" defaultValue={departure ?? ''}>
            <option value="">Indifférent</option>
            <option value="1">Aujourd’hui ou demain</option>
            <option value="7">Sous 7 jours</option>
            <option value="30">Sous 30 jours</option>
          </Select>
        </FilterField>
        <ResetLink href={`/aujourdhui?vue=${view}`} />
      </FilterBar>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile label="Urgent (rouge)" value={(view === 'moi' ? mine : all).filter((t) => t.priority === 'red').length} tone="danger" />
        <SummaryTile label="Aujourd’hui (orange)" value={(view === 'moi' ? mine : all).filter((t) => t.priority === 'orange').length} tone="warning" />
        <SummaryTile label="En attente / bloquées" value={blocked.length} tone="neutral" />
        <SummaryTile label="Sans responsable" value={unassigned.length} tone={unassigned.length ? 'warning' : 'neutral'} />
      </div>

      <div className="space-y-6">
        {view === 'equipe' ? (
          <>
            <Card>
              <CardHeader title="Charge par personne" description="Tâches ouvertes par responsable : surcharges et retards." />
              <CardBody>
                <Table className="-mx-5">
                  <thead>
                    <tr><Th>Responsable</Th><Th className="text-right">Ouvertes</Th><Th className="text-right">Urgent</Th><Th className="text-right">Aujourd’hui</Th><Th className="text-right">En retard</Th><Th className="text-right">En attente</Th><Th /></tr>
                  </thead>
                  <tbody>
                    {[...load.entries()].sort((a, b) => b[1].red - a[1].red || b[1].total - a[1].total).map(([id, l]) => (
                      <tr key={id}>
                        <Td className={id === 'none' ? 'font-medium text-warning-600' : 'font-medium'}>{l.name}</Td>
                        <Td className="text-right tabular">{l.total}</Td>
                        <Td className="text-right tabular">{l.red ? <Badge tone="danger">{l.red}</Badge> : 0}</Td>
                        <Td className="text-right tabular">{l.orange ? <Badge tone="warning">{l.orange}</Badge> : 0}</Td>
                        <Td className="text-right tabular">{l.overdue}</Td>
                        <Td className="text-right tabular">{l.waiting}</Td>
                        <Td className="text-right"><Link className="text-sm text-brand-600 hover:underline" href={`/aujourdhui?vue=equipe&responsable=${id === 'none' ? 'aucun' : id}`}>Filtrer</Link></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
            {unassigned.length && !assignee ? (
              <Card>
                <CardHeader title={`Tâches sans responsable (${unassigned.length})`} description="À attribuer : la priorité reste calculée même sans affectation." />
                <CardBody><TaskTable tasks={unassigned} {...tableProps} /></CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title={`Toutes les tâches de l’équipe (${all.length})`} />
              <CardBody><TaskTable tasks={all} {...tableProps} /></CardBody>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader title={`Mes tâches (${mine.length})`} actions={<StaffBadge name={session.profile.full_name} />} />
              <CardBody><TaskTable tasks={mine} {...tableProps} emptyTitle="Aucune tâche ouverte à votre nom" /></CardBody>
            </Card>
            <Card>
              <CardHeader title={`Blocages et attentes (${blocked.length})`} description="Une attente ne suspend pas une limite contractuelle." />
              <CardBody><TaskTable tasks={blocked} {...tableProps} emptyTitle="Aucun blocage" /></CardBody>
            </Card>
            <Card>
              <CardHeader title={`Mes dossiers partagés (${shared.length})`} description="Tâches confiées à d’autres collaborateurs sur les dossiers dont vous êtes responsable." />
              <CardBody><TaskTable tasks={shared} {...tableProps} emptyTitle="Aucune tâche partagée" /></CardBody>
            </Card>
          </>
        )}
      </div>
    </>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'warning' | 'neutral' }) {
  const cls = tone === 'danger' ? 'text-danger-700' : tone === 'warning' ? 'text-warning-600' : 'text-brand-900'
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tabular ${cls}`}>{value}</p>
    </div>
  )
}

function StaffBadge({ name }: { name: string }) {
  return <Badge tone="brand">{name}</Badge>
}
