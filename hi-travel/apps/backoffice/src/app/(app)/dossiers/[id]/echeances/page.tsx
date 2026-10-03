import { Card, CardBody, CardHeader } from '@hi/ui'
import { DeadlineTable, type DeadlineRow } from '@/components/ops/deadline-table'
import { DeadlineCreateForm } from '@/components/ops/task-forms'
import { Disclosure } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, getStaff } from '@/lib/ops/data'
import { getDossier, getDossierServices } from '@/lib/ops/dossier'

export const metadata = { title: 'Dossier — échéances fournisseurs' }

export default async function DossierDeadlinesTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('tasks')
  const { id } = await params
  await getDossier(id)
  const supabase = await db()
  const [{ data }, services, staff] = await Promise.all([
    supabase.from('external_deadlines').select('*, dossiers(reference, title), services(description)').eq('dossier_id', id).order('due_at', { nullsFirst: true }),
    getDossierServices(id),
    getStaff(),
  ])
  return (
    <div className="space-y-6">
      {session.can('tasks', 'update') ? (
        <Disclosure summary="Ajouter une échéance contractuelle">
          <DeadlineCreateForm dossierId={id} services={services.filter((s) => s.status !== 'cancelled').map((s) => ({ id: s.id, description: s.description }))} staff={staff} />
        </Disclosure>
      ) : null}
      <Card>
        <CardHeader title="Échéances fournisseurs" description="Limites d’émission, expirations d’option, règlements fournisseurs… Source et date de réception conservées ; une date manquante reste « délai à compléter »." />
        <CardBody><DeadlineTable rows={(data ?? []) as DeadlineRow[]} canUpdate={session.can('tasks', 'update')} showDossier={false} /></CardBody>
      </Card>
    </div>
  )
}
