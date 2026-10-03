import type { Metadata } from 'next'
import { activityFromSlug, activitySlugs } from '@hi/core'
import { Alert } from '@hi/ui'
import { ActivityPage } from '@/components/activity-page'
import { HotelSearchForm } from '@/components/hotel-search-form'
import { t } from '@/lib/i18n'
import { notFoundOrRedirect } from '@/lib/redirects'
import { getOffers } from '@/lib/site-data'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const activity = activityFromSlug((await params).slug)
  if (!activity) return { title: t.errors.notFoundTitle }
  const c = t.activityContent[activity]
  return { title: c.title, description: c.metaDescription, alternates: { canonical: `/activites/${activitySlugs[activity]}` } }
}

export default async function ActivityRoute({ params }: Props) {
  const { slug } = await params
  const activity = activityFromSlug(slug)
  if (!activity) return notFoundOrRedirect(`/activites/${slug}`)
  const c = t.activityContent[activity]
  const offers = (await getOffers()).filter((o) => o.activity === activity && !o.isOmra)

  let extra: React.ReactNode = null
  if (activity === 'hotel_tn') {
    extra = (
      <section aria-labelledby="hotel-search" className="mt-12 rounded-card border border-brand-100 bg-brand-50 p-5 sm:p-8">
        <h2 id="hotel-search" className="text-2xl font-semibold text-brand-900">{t.home.hotelTitle}</h2>
        <p className="mt-2 text-muted">{t.home.hotelText}</p>
        <div className="mt-5"><HotelSearchForm idPrefix="act-hs" /></div>
      </section>
    )
  } else if (activity === 'hotel_intl' || activity === 'ticketing') {
    extra = <Alert tone="info" className="mt-10" title={t.hotels.abroadTitle}>{t.hotels.abroadText}</Alert>
  }

  return (
    <ActivityPage
      activity={activity}
      title={c.title}
      intro={c.intro}
      points={c.points}
      offers={offers}
      extra={extra}
      crumbs={[{ href: '/activites', label: t.nav.activities }, { label: c.title }]}
    />
  )
}
