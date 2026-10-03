import Link from 'next/link'
import type { Metadata } from 'next'
import { ACTIVITIES, activityFromSlug, activitySlugs } from '@hi/core'
import { cn } from '@hi/ui'
import { PathIcon } from '@/components/icons'
import { Container, PageHero } from '@/components/page'
import { RequestSection } from '@/components/request-section'
import { activityIcon } from '@/lib/activities'
import { t } from '@/lib/i18n'

export const metadata: Metadata = { title: t.quote.metaTitle, description: t.quote.intro, alternates: { canonical: '/devis' } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Demande de devis : choix de l'activité puis formulaire adapté (FO04). */
export default async function QuotePage({ searchParams }: Props) {
  const sp = await searchParams
  const slug = typeof sp.activite === 'string' ? sp.activite : ''
  const isOmra = slug === 'omra'
  const activity = isOmra ? 'organized_trip' : activityFromSlug(slug) ?? 'tailor_made'
  const current = isOmra ? 'omra' : activity
  const choices = [
    ...ACTIVITIES.map((a) => ({ key: a as string, slug: activitySlugs[a], label: t.activityContent[a].title, icon: activityIcon[a] })),
    { key: 'omra', slug: 'omra', label: t.omra.title, icon: 'M12 3l8 4v2H4V7l8-4zM5 9v10M19 9v10M9 9v10M15 9v10M3 21h18' },
  ]
  return (
    <>
      <PageHero title={t.quote.title} intro={t.quote.intro} crumbs={[{ label: t.quote.title }]} />
      <Container className="py-10">
        <nav aria-labelledby="choose-title">
          <h2 id="choose-title" className="text-lg font-semibold text-brand-900">{t.quote.choose}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {choices.map((c) => {
              const active = c.key === current
              return (
                <li key={c.key}>
                  <Link
                    href={`/devis?activite=${c.slug}#demande`}
                    scroll={false}
                    aria-current={active ? 'page' : undefined}
                    className={cn('flex h-full items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors',
                      active ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white text-brand-900 hover:border-brand-300 hover:bg-brand-50')}
                  >
                    <PathIcon d={c.icon} className="size-5 shrink-0" />{c.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <section id="demande" aria-labelledby="demande-title" className="mt-8 scroll-mt-28 rounded-card border border-line bg-white p-5 shadow-sm sm:p-8">
          <h2 id="demande-title" className="text-2xl font-semibold text-brand-900">
            {isOmra ? t.omra.title : t.activityContent[activity].title}
          </h2>
          <p className="mt-2 max-w-3xl text-muted">{isOmra ? t.omra.intro : t.activityContent[activity].intro}</p>
          <div className="mt-6 max-w-4xl">
            <RequestSection key={current} activity={activity} category={isOmra ? 'omra' : undefined} idPrefix={`devis-${current}`} />
          </div>
        </section>
      </Container>
    </>
  )
}
