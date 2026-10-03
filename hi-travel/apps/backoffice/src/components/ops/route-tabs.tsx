'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Onglets reliés aux sous-routes (l’onglet actif est déduit de l’URL). */
export function RouteTabs({ tabs, exact }: { tabs: Array<{ href: string; label: string; count?: number }>; exact?: string }) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))
  return (
    <div className="mb-5 overflow-x-auto border-b border-line">
      <nav className="-mb-px flex min-w-max gap-1" aria-label="Onglets">
        {tabs.map((t) => {
          const active = isActive(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'border-b-2 border-accent-400 px-3 py-2 text-sm font-semibold text-brand-900'
                  : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-brand-700'
              }
            >
              {t.label}
              {t.count != null ? <span className="ml-1.5 rounded-full bg-canvas px-1.5 text-xs text-muted">{t.count}</span> : null}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
