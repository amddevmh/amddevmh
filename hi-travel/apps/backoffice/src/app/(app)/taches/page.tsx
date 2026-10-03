import { ACTIVITIES, activityLabels, taskStatusLabels } from '@hi/core'
import { Card, CardBody, CardHeader, Select } from '@hi/ui'
import { FilterBar } from '@/components/page'
import { TaskTable } from '@/components/ops/task-table'
import { TaskCreateForm } from '@/components/ops/task-forms'
import { Disclosure, FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, getOpenDossierOptions, getStaff, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'
import { OPEN_TASK_STATUSES } from '@/lib/ops/labels'

export const metadata = { title: 'Tâches' }

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('tasks')
  const params = await searchParams
  const assignee = sp(params, 'responsable')
  const status = sp(params, 'etat') ?? 'ouvertes'
  const overdue = sp(params, 'retard') === '1'
  const activity = sp(params, 'activite')
  const q = sp(params, 'q')
  const dossier = sp(params, 'dossier')

  const supabase = await db()
  let query = supabase.from('task_board').select('*')
  if (status === 'ouvertes') query = query.in('status', [...OPEN_TASK_STATUSES])
  else if (status !== 'toutes') query = query.eq('status', status as never)
  if (assignee === 'aucun') query = query.is('assignee_id', null)
  else if (assignee === 'moi') query = query.eq('assignee_id', session.userId)
  else if (assignee) query = query.eq('assignee_id', assignee)
  if (overdue) query = query.lt('due_at', new Date().toISOString()).in('status', [...OPEN_TASK_STATUSES])
  if (activity) query = query.eq('activity', activity as never)
  if (dossier) query = query.eq('dossier_id', dossier)
  if (q) query = query.or(`title.ilike.${ilikeValue(q)},dossier_reference.ilike.${ilikeValue(q)},client_name.ilike.${ilikeValue(q)}`)

  const [{ data: tasks, error }, staff, dossiers] = await Promise.all([
    query.order('priority_rank').order('due_at', { nullsFirst: false }).limit(500),
    getStaff(),
    getOpenDossierOptions(),
  ])
  const serviceIds = [...new Set((tasks ?? []).map((t) => t.service_id).filter((x): x is string => !!x))]
  const { data: services } = serviceIds.length ? await supabase.from('services').select('id, description').in('id', serviceIds) : { data: [] }
  const serviceMap = new Map((services ?? []).map((s) => [s.id, s.description]))

  return (
    <div className="space-y-5">
      {session.can('tasks', 'create') ? (
        <Disclosure summary="Nouvelle tâche">
          <TaskCreateForm staff={staff} dossiers={dossiers} />
        </Disclosure>
      ) : null}

      <FilterBar action="/taches">
        <FilterField label="Recherche">
          <FilterInput name="q" defaultValue={q} placeholder="Intitulé, dossier, client" />
        </FilterField>
        <FilterField label="Responsable">
          <Select name="responsable" defaultValue={assignee ?? ''}>
            <option value="">Tous</option>
            <option value="moi">Moi</option>
            <option value="aucun">Non attribuées</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </FilterField>
        <FilterField label="État">
          <Select name="etat" defaultValue={status}>
            <option value="ouvertes">Ouvertes</option>
            <option value="toutes">Toutes</option>
            {Object.keys(taskStatusLabels).map((s) => <option key={s} value={s}>{taskStatusLabels[s]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Activité">
          <Select name="activite" defaultValue={activity ?? ''}>
            <option value="">Toutes</option>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
          </Select>
        </FilterField>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="retard" value="1" defaultChecked={overdue} className="size-4" /> En retard
        </label>
        <ResetLink href="/taches" />
      </FilterBar>

      <Card>
        <CardHeader title={`${tasks?.length ?? 0} tâche(s)`} description={error ? `Erreur : ${error.message}` : 'Classées par priorité puis par échéance.'} />
        <CardBody>
          <TaskTable tasks={tasks ?? []} staff={staff} services={serviceMap} canReassign={session.can('tasks', 'update')} userId={session.userId} />
        </CardBody>
      </Card>
    </div>
  )
}
