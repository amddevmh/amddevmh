import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { buttonClass } from '@hi/ui'
import { ActivityGrid, CtaBand } from '@/components/blocks'
import { UpcomingDepartures } from '@/components/departures'
import { HotelSearchForm } from '@/components/hotel-search-form'
import { Icon } from '@/components/icons'
import { OfferCard, canOptimize } from '@/components/offer'
import { Container, Section, SectionTitle } from '@/components/page'
import { t } from '@/lib/i18n'
import { getAgency, getOffers, getUpcomingDepartures } from '@/lib/site-data'

export const metadata: Metadata = {
  title: { absolute: t.home.metaTitle },
  description: t.brand.baseline,
  alternates: { canonical: '/' },
}

export default async function HomePage() {
  const [agency, offers, departures] = await Promise.all([getAgency(), getOffers(), getUpcomingDepartures(5)])
  const featured = (offers.some((o) => o.featured) ? offers.filter((o) => o.featured) : offers).slice(0, 6)
  const heroPhoto = featured.find((o) => o.photos[0])?.photos[0]

  return (
    <>
      {/* Accueil : bandeau principal */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-brand-900 text-white">
        {heroPhoto ? (
          <Image src={heroPhoto.url} alt="" fill priority sizes="100vw" unoptimized={!canOptimize(heroPhoto.url)} className="-z-20 object-cover opacity-45" />
        ) : null}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-900 via-brand-900/85 to-brand-900/30" />
        <Container className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-accent-300 ring-1 ring-white/15">
              <Icon name="plane" className="size-4" /> {t.home.heroKicker}
            </p>
            <h1 id="hero-title" className="mt-5 text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-6xl">{t.home.heroTitle}</h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">{t.home.heroText}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/devis" className={buttonClass('accent', 'lg')}>{t.cta.requestQuote}</Link>
              <Link href="/offres" className={buttonClass('secondary', 'lg')}>{t.cta.browseOffers}</Link>
              <Link href="/contact" className={buttonClass('ghost', 'lg', 'text-white ring-1 ring-white/30 hover:bg-white/10')}>{t.cta.contactUs}</Link>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-5 text-ink shadow-2xl sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-900">
              <Icon name="bed" className="size-5 text-accent-500" /> {t.home.hotelTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">{t.home.hotelText}</p>
            <div className="mt-4">
              <HotelSearchForm variant="compact" idPrefix="home-hs" />
            </div>
          </div>
        </Container>
      </section>

      {/* Activités */}
      <Section labelledBy="activities-title" className="bg-canvas">
        <SectionTitle id="activities-title" kicker={t.nav.activities} title={t.home.activitiesTitle} text={t.home.activitiesText} />
        <ActivityGrid />
      </Section>

      {/* Offres sélectionnées */}
      <Section labelledBy="featured-title">
        <SectionTitle
          id="featured-title"
          kicker={t.nav.offers}
          title={t.home.featuredTitle}
          text={t.home.featuredText}
          action={<Link href="/offres" className={buttonClass('secondary', 'md')}>{t.cta.browseOffers} <Icon name="arrowRight" className="size-4" /></Link>}
        />
        {featured.length > 0 ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((o, i) => <li key={o.id} className="flex"><OfferCard offer={o} priority={i < 3} /></li>)}
          </ul>
        ) : (
          <p className="rounded-card border border-dashed border-line p-8 text-center text-muted">{t.home.noOffers}</p>
        )}
      </Section>

      {/* Prochains départs */}
      <Section labelledBy="departures-title" className="bg-canvas">
        <SectionTitle id="departures-title" kicker={t.offer.departures} title={t.home.departuresTitle} text={t.home.departuresText} />
        {departures.length > 0 ? <UpcomingDepartures items={departures} /> : (
          <p className="rounded-card border border-dashed border-line bg-white p-8 text-center text-muted">{t.home.noDepartures}</p>
        )}
      </Section>

      {/* Pourquoi HI Travel */}
      <Section labelledBy="trust-title">
        <SectionTitle id="trust-title" title={t.home.trustTitle} />
        <ul className="grid gap-6 md:grid-cols-3">
          {t.home.trust.map((it, i) => (
            <li key={it.title} className="rounded-card border border-line p-6">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-accent-50 text-accent-600">
                <Icon name={(['user', 'check', 'shield'] as const)[i] ?? 'check'} className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-brand-900">{it.title}</h3>
              <p className="mt-2 text-sm text-muted">{it.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand agency={agency} />
    </>
  )
}
