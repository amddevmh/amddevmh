import { roleLabels } from '@hi/core'
import { Sidebar } from '@/components/sidebar'
import { requireStaff } from '@/lib/auth'
import { NAV, type NavItem } from '@/lib/nav'
import { signOut } from '../login/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff()
  const visible = (items: NavItem[]): NavItem[] =>
    items
      .filter((i) => !i.module || session.can(i.module))
      .map((i) => (i.children ? { ...i, children: visible(i.children) } : i))
      .filter((i) => !i.children || i.children.length > 0)

  return (
    <div className="lg:flex">
      <Sidebar items={visible(NAV)} />
      <div className="min-w-0 flex-1">
        <div className="sticky top-14 z-20 flex h-14 items-center justify-end gap-4 border-b border-line bg-white/90 px-4 backdrop-blur lg:top-0 lg:px-8">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-brand-900">{session.profile.full_name}</p>
            <p className="text-xs text-muted">{roleLabels[session.profile.role]}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="rounded-lg px-3 py-1.5 text-sm text-brand-700 ring-1 ring-line hover:bg-brand-50">Déconnexion</button>
          </form>
        </div>
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
