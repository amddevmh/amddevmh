import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth'

export default async function SiteIndex() {
  await requireStaff('site', 'read')
  redirect('/site/offres')
}
