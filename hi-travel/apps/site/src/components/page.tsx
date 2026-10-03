import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@hi/ui'
import { t } from '@/lib/i18n'
import { Icon } from './icons'

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
}

export function Section({ className, children, id, labelledBy }: { className?: string; children: ReactNode; id?: string; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn('py-14 sm:py-20', className)}>
      <Container>{children}</Container>
    </section>
  )
}

export function SectionTitle({ id, kicker, title, text, action, className }: { id?: string; kicker?: string; title: ReactNode; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="max-w-2xl">
        {kicker ? <p className="text-sm font-semibold uppercase tracking-wider text-accent-600">{kicker}</p> : null}
        <h2 id={id} className="mt-1 text-2xl font-semibold text-brand-900 sm:text-3xl">{title}</h2>
        {text ? <p className="mt-2 text-muted">{text}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export interface Crumb { href?: string; label: string }

export function Breadcrumbs({ items, light }: { items: Crumb[]; light?: boolean }) {
  return (
    <nav aria-label={t.a11y.breadcrumb}>
      <ol className={cn('flex flex-wrap items-center gap-1 text-sm', light ? 'text-white/75' : 'text-muted')}>
        <li><Link href="/" className={cn('hover:underline', light ? 'hover:text-white' : 'hover:text-brand-600')}>{t.nav.home}</Link></li>
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            <Icon name="chevronRight" className="size-3.5 opacity-60" />
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className={cn('hover:underline', light ? 'hover:text-white' : 'hover:text-brand-600')}>{c.label}</Link>
            ) : (
              <span aria-current="page" className={light ? 'text-white' : 'text-ink'}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Bandeau de titre des pages intérieures. */
export function PageHero({ title, intro, crumbs, kicker, children }: { title: ReactNode; intro?: ReactNode; crumbs: Crumb[]; kicker?: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-brand-900 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(250,173,50,0.25),transparent_45%),radial-gradient(circle_at_10%_90%,rgba(15,78,158,0.7),transparent_55%)]" />
      <Container className="relative py-10 sm:py-14">
        <Breadcrumbs items={crumbs} light />
        {kicker ? <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-accent-300">{kicker}</p> : null}
        <h1 className={cn('text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl', kicker ? 'mt-2' : 'mt-6')}>{title}</h1>
        {intro ? <p className="mt-4 max-w-3xl text-base text-white/80 sm:text-lg">{intro}</p> : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </Container>
    </div>
  )
}

/** Texte simple administrable (paragraphes séparés par une ligne vide). */
export function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return (
    <div className="space-y-4 text-base leading-relaxed text-ink">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">{p}</p>
      ))}
    </div>
  )
}
