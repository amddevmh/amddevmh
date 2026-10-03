'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { buttonClass, cn } from '@hi/ui'
import { Icon } from './icons'

export interface NavItem { href: string; label: string }

interface Props {
  items: NavItem[]
  activities: NavItem[]
  labels: { activities: string; allActivities: string; openMenu: string; closeMenu: string; mainNav: string; clientSpace: string; requestQuote: string; contactUs: string }
  activitiesAfter: number
  phone?: { href: string; label: string }
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

/** Navigation principale : menu déroulant « Activités » au clavier, panneau mobile. */
export function MainNav({ items, activities, labels, activitiesAfter, phone }: Props) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuId = useId()
  const mobileId = useId()
  const wrapRef = useRef<HTMLLIElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Fermeture au changement de page
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setMenuOpen(false)
    setMobileOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const activitiesActive = pathname.startsWith('/activites') || pathname.startsWith('/hotels')
  const linkCls = (active: boolean) =>
    cn('rounded-md px-3 py-2 text-[0.95rem] font-medium transition-colors hover:bg-brand-50 hover:text-brand-600', active ? 'text-brand-600' : 'text-brand-900')

  return (
    <>
      <nav aria-label={labels.mainNav} className="hidden lg:block">
        <ul className="flex items-center gap-1">
          {items.slice(0, activitiesAfter).map((it) => (
            <li key={it.href}>
              <Link href={it.href} className={linkCls(isActive(pathname, it.href))} aria-current={isActive(pathname, it.href) ? 'page' : undefined}>{it.label}</Link>
            </li>
          ))}
          <li className="relative" ref={wrapRef}>
            <button
              ref={buttonRef}
              type="button"
              className={cn(linkCls(activitiesActive), 'inline-flex items-center gap-1')}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {labels.activities}
              <Icon name="chevronDown" className={cn('size-4 transition-transform', menuOpen && 'rotate-180')} />
            </button>
            <div
              id={menuId}
              hidden={!menuOpen}
              className="absolute left-1/2 top-full z-40 mt-2 w-[34rem] -translate-x-1/2 rounded-card border border-line bg-white p-3 shadow-xl"
            >
              <ul className="grid grid-cols-2 gap-1">
                {activities.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-brand-50 hover:text-brand-700" aria-current={isActive(pathname, a.href) ? 'page' : undefined}>
                      <Icon name="chevronRight" className="size-4 text-accent-500" />
                      {a.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-line pt-2">
                <Link href="/activites" className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">
                  {labels.allActivities} <Icon name="arrowRight" className="size-4" />
                </Link>
              </div>
            </div>
          </li>
          {items.slice(activitiesAfter).map((it) => (
            <li key={it.href}>
              <Link href={it.href} className={linkCls(isActive(pathname, it.href))} aria-current={isActive(pathname, it.href) ? 'page' : undefined}>{it.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center gap-2">
        <div className="hidden sm:block">
          <Link href="/espace-client" className={buttonClass('ghost', 'md')}>
            <Icon name="user" className="size-4" /> {labels.clientSpace}
          </Link>
        </div>
        <div className="hidden md:block">
          <Link href="/devis" className={buttonClass('accent', 'md')}>{labels.requestQuote}</Link>
        </div>
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-lg text-brand-900 hover:bg-brand-50 lg:hidden"
          aria-expanded={mobileOpen}
          aria-controls={mobileId}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="sr-only">{mobileOpen ? labels.closeMenu : labels.openMenu}</span>
          <Icon name={mobileOpen ? 'close' : 'menu'} className="size-6" />
        </button>
      </div>

      <div id={mobileId} hidden={!mobileOpen} className="absolute inset-x-0 top-full z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-line bg-white shadow-xl lg:hidden">
        <nav aria-label={labels.mainNav} className="mx-auto max-w-7xl px-4 py-4">
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} className={cn('block rounded-lg px-3 py-3 font-medium', isActive(pathname, it.href) ? 'bg-brand-50 text-brand-700' : 'text-brand-900 hover:bg-brand-50')} aria-current={isActive(pathname, it.href) ? 'page' : undefined}>{it.label}</Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{labels.activities}</p>
          <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activities.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-brand-50" aria-current={isActive(pathname, a.href) ? 'page' : undefined}>{a.label}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-3">
            <Link href="/devis" className={buttonClass('accent', 'lg')}>{labels.requestQuote}</Link>
            <Link href="/contact" className={buttonClass('secondary', 'lg')}>{labels.contactUs}</Link>
            <Link href="/espace-client" className={buttonClass('primary', 'lg')}>{labels.clientSpace}</Link>
          </div>
          {phone ? (
            <a href={phone.href} className="mt-3 flex items-center justify-center gap-2 py-2 text-sm font-medium text-brand-700">
              <Icon name="phone" className="size-4" /> {phone.label}
            </a>
          ) : null}
        </nav>
      </div>
    </>
  )
}
