import type { Metadata } from 'next'
import { ChangePasswordForm } from '@/components/auth-forms'
import { PortalShell } from '@/components/portal-shell'
import { t } from '@/lib/i18n'
import { getPortalSession } from '@/lib/portal'

export const metadata: Metadata = { title: t.portal.changePassword.title, robots: { index: false } }

/** Changement de mot de passe d'un client connecté (mot de passe actuel exigé). */
export default async function ChangePasswordPage() {
  const { email } = await getPortalSession('/espace-client/mot-de-passe')
  const cp = t.portal.changePassword
  return (
    <PortalShell email={email} crumbs={[{ href: '/espace-client', label: t.portal.title }, { label: cp.title }]} title={cp.title}>
      <div className="max-w-lg rounded-card border border-line bg-white p-6 shadow-sm">
        <p className="mb-5 text-sm text-muted">{cp.intro}</p>
        <ChangePasswordForm />
      </div>
    </PortalShell>
  )
}
