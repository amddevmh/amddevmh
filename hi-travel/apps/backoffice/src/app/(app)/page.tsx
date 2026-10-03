import { PageHeader } from '@/components/page'
import { requireStaff } from '@/lib/auth'

export default async function DashboardPage() {
  const session = await requireStaff()
  return <PageHeader title="Tableau de bord" description={`Bonjour ${session.profile.full_name}`} />
}
