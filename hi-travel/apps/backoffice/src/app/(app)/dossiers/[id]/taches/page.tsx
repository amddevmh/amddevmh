import { Card, CardBody, CardHeader } from '@hi/ui'
import { TaskCreateForm } from '@/components/ops/task-forms'
import { TaskTable } from '@/components/ops/task-table'
import { Disclosure } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, getStaff } from '@/lib/ops/data'
import { getDossier, getDossierServices } from '@/lib/ops/dossier'

export const metadata = { title: 'Dossier — tâches' }

export default async function DossierTasksTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('tasks')
  const { id } = await params
  const d = await getDossier(id)
  const supabase = await db()
  const [{ data: tasks }, staff, services] = await Promise.all([
    supabase.from('task_board').select('*').eq('dossier_id', id).order('priority_rank').order('due_at', { nullsFirst: false }),
    getStaff(),
    getDossierServices(id),
  ])
  const open = (tasks ?? []).filter((t) => !['done', 'cancelled'].includes(t.status ?? ''))
  const closed = (tasks ?? []).filter((t) => ['done', 'cancelled'].includes(t.status ?? ''))
  const serviceMap = new Map(services.map((s) => [s.id, s.description]))
  const props = { staff, services: serviceMap, canReassign: session.can('tasks', 'update'), userId: session.userId, showDossier: false }
  return (
    <div className="space-y-6">
      {session.can('tasks', 'create') ? (
        <Disclosure summary="Nouvelle tâche sur ce dossier">
          <TaskCreateForm staff={staff} dossierId={id} services={services.map((s) => ({ id: s.id, description: s.description }))} defaultAssignee={d.owner_id} />
        </Disclosure>
      ) : null}
      <Card>
        <CardHeader title={`Tâches ouvertes (${open.length})`} />
        <CardBody><TaskTable tasks={open} {...props} emptyTitle="Aucune tâche ouverte" /></CardBody>
      </Card>
      {closed.length ? (
        <Card>
          <CardHeader title={`Tâches terminées ou annulées (${closed.length})`} />
          <CardBody><TaskTable tasks={closed} {...props} /></CardBody>
        </Card>
      ) : null}
    </div>
  )
}
