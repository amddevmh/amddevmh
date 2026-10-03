import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Activity } from '@hi/core'
import { buttonClass } from '@hi/ui'
import { getAgency, type Offer } from '@/lib/site-data'
import { t } from '@/lib/i18n'
import { ContactButtons } from './blocks'
import { Icon } from './icons'
import { OfferCard } from './offer'
import { Container, PageHero } from './page'
import { RequestSection } from './request-section'

/** Gabarit commun des pages d'activité et de la catégorie Omra (FO01). */
export async function ActivityPage({ activity, title, intro, points, offers, crumbs, category, extra, emptyText, offersTitle }: {
  activity: Activity
  title: string
  intro: string
  points: string[]
  offers: Offer[]
  crumbs: Array<{ href?: string; label: string }>
  category?: 'omra'
  extra?: ReactNode
  emptyText?: string
  offersTitle?: string
}) {
  const agency = await getAgency()
  return (
    <>
      <PageHero title={title} intro={intro} crumbs={crumbs}>
        <div className="flex flex-wrap gap-3">
          <a href="#demande" className={buttonClass('accent', 'lg')}>{t.cta.requestQuote}</a>
          <Link href="/contact" className={buttonClass('secondary', 'lg')}>{t.cta.contactUs}</Link>
        </div>
      </PageHero>

      <Container className="py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="what-we-do">
            <h2 id="what-we-do" className="text-2xl font-semibold text-brand-900">{t.activities.whatWeDo}</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {points.map((p) => (
                <li key={p} className="flex gap-3 rounded-card border border-line bg-white p-4">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600"><Icon name="check" className="size-4" /></span>
                  <span className="text-sm text-ink">{p}</span>
                </li>
              ))}
            </ul>
          </section>
          <aside className="rounded-card bg-brand-900 p-6 text-white">
            <p className="font-display text-lg font-semibold">{t.cta.contactUs}</p>
            <p className="mt-1 text-sm text-white/75">{agency.hours}</p>
            <div className="mt-4"><ContactButtons agency={{ ...agency, email: null }} light text={`Bonjour HI Travel, j’ai une question concernant : ${title}.`} /></div>
            <p className="mt-4 text-xs text-white/60">{t.footer.whatsappNote}</p>
          </aside>
        </div>

        {extra}

        <section aria-labelledby="related" className="mt-14">
          <h2 id="related" className="text-2xl font-semibold text-brand-900">{offersTitle ?? t.activities.relatedOffers}</h2>
          {offers.length > 0 ? (
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {offers.map((o) => <li key={o.id} className="flex"><OfferCard offer={o} /></li>)}
            </ul>
          ) : (
            <p className="mt-4 rounded-card border border-dashed border-line bg-canvas p-6 text-muted">{emptyText ?? t.activities.noRelated}</p>
          )}
        </section>

        <section aria-labelledby="demande-title" id="demande" className="mt-14 scroll-mt-28 rounded-card border border-line bg-white p-5 shadow-sm sm:p-8">
          <div className="max-w-3xl">
            <h2 id="demande-title" className="text-2xl font-semibold text-brand-900">{t.activities.formTitle} — {title}</h2>
            <p className="mt-2 text-muted">{t.form.noBookingNote}</p>
          </div>
          <div className="mt-6 max-w-4xl">
            <RequestSection activity={activity} category={category} idPrefix={`req-${category ?? activity}`} />
          </div>
        </section>
      </Container>
    </>
  )
}
