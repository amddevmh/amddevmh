'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@hi/ui'
import type { NavItem } from '@/lib/nav'

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const nav = (
    <nav aria-label="Navigation principale" className="flex flex-col gap-0.5 px-3 py-4 text-sm">
      {items.map((item) => {
        const active = isActive(pathname, item.href) || item.children?.some((c) => isActive(pathname, c.href))
        return (
          <div key={item.href}>
            <Link
              href={item.children?.[0]?.href ?? item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center rounded-lg px-3 py-2 font-medium transition-colors',
                active ? 'bg-white/10 text-white' : 'text-brand-100 hover:bg-white/5 hover:text-white',
              )}
            >
              {item.label}
            </Link>
            {item.children && active ? (
              <div className="mb-1 ml-3 mt-0.5 flex flex-col border-l border-white/10 pl-2">
                {item.children.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[13px] transition-colors',
                      isActive(pathname, c.href) ? 'font-medium text-accent-300' : 'text-brand-100/80 hover:text-white',
                    )}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-brand-900 px-4 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/hi-travel-logo.png" alt="HI Travel" width={102} height={30} priority className="brightness-0 invert" />
          <span className="text-xs font-medium text-brand-100">Back office</span>
        </Link>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20">
          {open ? 'Fermer' : 'Menu'}
        </button>
      </div>
      {open ? <div id="mobile-nav" className="fixed inset-x-0 top-14 bottom-0 z-30 overflow-y-auto bg-brand-900 lg:hidden">{nav}</div> : null}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-brand-900 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-6 pb-2 pt-6">
          <Image src="/hi-travel-logo.png" alt="HI Travel" width={136} height={40} priority className="brightness-0 invert" />
        </Link>
        <p className="px-6 text-xs font-medium uppercase tracking-wider text-accent-300">Back office</p>
        {nav}
      </aside>
    </>
  )
}
