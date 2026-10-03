import Link from 'next/link'
import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions, breadcrumbs }: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Array<{ href: string; label: string }>
}) {
  return (
    <header className="mb-6">
      {breadcrumbs?.length ? (
        <nav aria-label="Fil d’Ariane" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
          {breadcrumbs.map((b, i) => (
            <span key={b.href} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden>/</span> : null}
              <Link href={b.href} className="hover:text-brand-600 hover:underline">{b.label}</Link>
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-brand-900">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

/** Barre de filtres en GET : les listes filtrées sont partageables par URL. */
export function FilterBar({ children, action }: { children: ReactNode; action?: string }) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-3">
      {children}
      <button type="submit" className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">Filtrer</button>
    </form>
  )
}

export function Tabs({ tabs, current }: { tabs: Array<{ href: string; label: string; count?: number }>; current: string }) {
  return (
    <div className="mb-5 overflow-x-auto border-b border-line">
      <nav className="-mb-px flex min-w-max gap-1" aria-label="Onglets">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current === t.href ? 'page' : undefined}
            className={
              current === t.href
                ? 'border-b-2 border-accent-400 px-3 py-2 text-sm font-semibold text-brand-900'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-brand-700'
            }
          >
            {t.label}
            {t.count != null ? <span className="ml-1.5 rounded-full bg-canvas px-1.5 text-xs text-muted">{t.count}</span> : null}
          </Link>
        ))}
      </nav>
    </div>
  )
}
