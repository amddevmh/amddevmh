import { PageHeader } from '@/components/page'
import { RouteTabs } from '@/components/ops/route-tabs'
import { requireStaff } from '@/lib/auth'

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  await requireStaff('tasks')
  return (
    <>
      <PageHeader
        title="Tâches et calendrier"
        description="Affectation manuelle, échéances internes et dates contractuelles externes (jamais inventées)."
      />
      <RouteTabs
        exact="/taches"
        tabs={[
          { href: '/taches', label: 'Tâches' },
          { href: '/taches/calendrier', label: 'Calendrier' },
          { href: '/taches/echeances', label: 'Échéances fournisseurs' },
        ]}
      />
      {children}
    </>
  )
}
