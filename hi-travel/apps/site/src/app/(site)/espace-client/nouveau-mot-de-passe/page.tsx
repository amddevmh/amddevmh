import type { Metadata } from 'next'
import { AuthCard } from '@/components/auth-card'
import { NewPasswordForm } from '@/components/auth-forms'
import { t } from '@/lib/i18n'
import { getPortalSession } from '@/lib/portal'

export const metadata: Metadata = { title: t.portal.newPasswordTitle, robots: { index: false } }

export default async function NewPasswordPage() {
  await getPortalSession('/espace-client/nouveau-mot-de-passe')
  return (
    <AuthCard title={t.portal.newPasswordTitle}>
      <NewPasswordForm />
    </AuthCard>
  )
}
