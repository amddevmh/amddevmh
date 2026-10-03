import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth'

export default async function FinancesIndex() {
  await requireStaff('finance', 'read')
  redirect('/finances/factures')
}
