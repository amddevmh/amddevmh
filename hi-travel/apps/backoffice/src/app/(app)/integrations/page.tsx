import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth'

export default async function IntegrationsIndex() {
  const session = await requireStaff('imports', 'read')
  redirect(session.can('integrations', 'read') ? '/integrations/hotels' : '/integrations/imports')
}
