import Link from 'next/link'
import type { ReactNode } from 'react'
import { logout } from '@/actions/auth'
import { t } from '@/lib/i18n'
import { Icon } from './icons'
import { Breadcrumbs, Container, type Crumb } from './page'

/** En-tête de l'espace client : identité du compte connecté et déconnexion. */
export function PortalShell({ email, crumbs, title, children, actions }: { email: string; crumbs: Crumb[]; title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="bg-canvas">
      <div className="border-b border-line bg-white">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Icon name="user" className="size-4 text-brand-500" />
            <span>{t.portal.title} · <span className="font-medium text-ink" data-testid="portal-email">{email}</span></span>
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <Link href="/espace-client/mot-de-passe" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
              <Icon name="lock" className="size-4" /> {t.portal.changePassword.link}
            </Link>
            <form action={logout}>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
                <Icon name="arrowRight" className="size-4" /> {t.portal.logout}
              </button>
            </form>
          </div>
        </Container>
      </div>
      <Container className="py-8">
        <Breadcrumbs items={crumbs} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold text-brand-900 sm:text-3xl">{title}</h1>
          {actions}
        </div>
        <div className="mt-6">{children}</div>
      </Container>
    </div>
  )
}
