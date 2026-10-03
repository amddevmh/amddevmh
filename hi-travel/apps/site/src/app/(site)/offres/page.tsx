import Link from 'next/link'
import type { Metadata } from 'next'
import { ACTIVITIES, activityFromSlug, activitySlugs } from '@hi/core'
import { Select, buttonClass } from '@hi/ui'
import { HotelSearchForm } from '@/components/hotel-search-form'
import { Icon } from '@/components/icons'
import { OfferCard } from '@/components/offer'
import { Container, PageHero } from '@/components/page'
import { t } from '@/lib/i18n'
import { getDepartures, getOffers, type Offer } from '@/lib/site-data'
import { todayTunis } from '@/lib/forms'

export const metadata: Metadata = {
  title: t.offers.metaTitle,
  description: t.offers.metaDescription,
  alternates: { canonical: '/offres' },
}

type SP = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

function nextMonths(n: number): Array<{ value: string; label: string }> {
  const [y, m] = todayTunis().split('-').map(Number) as [number, number]
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    const value = d.toISOString().slice(0, 7)
    const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) }
  })
}

const DURATIONS: Record<string, (d: number) => boolean> = {
  short: (d) => d <= 4,
  medium: (d) => d >= 5 && d <= 8,
  long: (d) => d >= 9,
}

export default async function OffersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const [offers, departures] = await Promise.all([getOffers(), getDepartures()])
  const f = {
    destination: one(sp.destination),
    activite: one(sp.activite),
    periode: one(sp.periode),
    duree: one(sp.duree),
    budget: one(sp.budget),
  }
  const destinations = Array.from(new Set(offers.map((o) => o.destination).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'))
  const months = nextMonths(12)
  const activity = f.activite && f.activite !== 'omra' ? activityFromSlug(f.activite) : undefined
  const budget = Number(f.budget) || null

  // Départs commercialisables (hors expirés / fermés) par offre, pour le filtre de période
  const depsByOffer = new Map<string, string[]>()
  for (const d of departures) {
    if (d.availability === 'expired' || d.availability === 'closed') continue
    depsByOffer.set(d.offerId, [...(depsByOffer.get(d.offerId) ?? []), d.startDate])
  }

  const filtered = offers.filter((o: Offer) => {
    if (f.destination && o.destination !== f.destination) return false
    if (f.activite === 'omra' && !o.isOmra) return false
    if (activity && o.activity !== activity) return false
    if (f.periode && !(depsByOffer.get(o.id) ?? []).some((s) => s.startsWith(f.periode))) return false
    if (f.duree && DURATIONS[f.duree] && !(o.durationDays != null && DURATIONS[f.duree]!(o.durationDays))) return false
    if (budget && (o.priceAmount == null || o.priceAmount > budget)) return false
    return true
  })
  const active = Object.values(f).some(Boolean)
  const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted'

  return (
    <>
      <PageHero title={t.offers.title} intro={t.offers.intro} crumbs={[{ label: t.offers.title }]} />
      <Container className="py-10">
        <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
          <aside className="space-y-6">
            <form method="get" action="/offres" className="rounded-card border border-line bg-white p-5 shadow-sm" aria-labelledby="filters-title">
              <h2 id="filters-title" className="flex items-center gap-2 text-base font-semibold text-brand-900">
                <Icon name="search" className="size-4" /> {t.offers.filters}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label htmlFor="f-destination" className={label}>{t.offers.destination}</label>
                  <Select id="f-destination" name="destination" defaultValue={f.destination}>
                    <option value="">{t.offers.anyDestination}</option>
                    {destinations.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="f-activite" className={label}>{t.offers.activity}</label>
                  <Select id="f-activite" name="activite" defaultValue={f.activite}>
                    <option value="">{t.offers.anyActivity}</option>
                    {ACTIVITIES.map((a) => <option key={a} value={activitySlugs[a]}>{t.activityContent[a].title}</option>)}
                    <option value="omra">{t.nav.omra}</option>
                  </Select>
                </div>
                <div>
                  <label htmlFor="f-periode" className={label}>{t.offers.period}</label>
                  <Select id="f-periode" name="periode" defaultValue={f.periode}>
                    <option value="">{t.offers.anyPeriod}</option>
                    {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="f-duree" className={label}>{t.offers.duration}</label>
                  <Select id="f-duree" name="duree" defaultValue={f.duree}>
                    <option value="">{t.offers.anyDuration}</option>
                    {Object.entries(t.offers.durations).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="f-budget" className={label}>{t.offers.budget}</label>
                  <Select id="f-budget" name="budget" defaultValue={f.budget}>
                    <option value="">{t.offers.anyBudget}</option>
                    {Object.entries(t.offers.budgets).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <button type="submit" className={buttonClass('primary', 'md', 'flex-1')}>{t.common.filter}</button>
                {active ? <Link href="/offres" className={buttonClass('ghost', 'md')}>{t.common.reset}</Link> : null}
              </div>
            </form>

            <div className="rounded-card border border-brand-100 bg-brand-50 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-brand-900"><Icon name="bed" className="size-5 text-accent-500" />{t.offers.hotelBoxTitle}</h2>
              <p className="mt-1 text-sm text-muted">{t.offers.hotelBoxText}</p>
              <div className="mt-4"><HotelSearchForm variant="compact" idPrefix="cat-hs" /></div>
            </div>
          </aside>

          <section aria-labelledby="results-title">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="results-title" className="text-xl font-semibold text-brand-900" aria-live="polite">{t.offers.results(filtered.length)}</h2>
            </div>
            {filtered.length > 0 ? (
              <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3" data-testid="offer-results">
                {filtered.map((o, i) => <li key={o.id} className="flex"><OfferCard offer={o} priority={i < 3} /></li>)}
              </ul>
            ) : (
              <div className="rounded-card border border-dashed border-line bg-canvas px-6 py-14 text-center">
                <p className="text-lg font-semibold text-brand-900">{t.offers.emptyTitle}</p>
                <p className="mx-auto mt-2 max-w-md text-muted">{t.offers.emptyText}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link href="/offres" className={buttonClass('secondary', 'md')}>{t.common.reset}</Link>
                  <Link href="/devis" className={buttonClass('accent', 'md')}>{t.cta.requestQuote}</Link>
                </div>
              </div>
            )}
          </section>
        </div>
      </Container>
    </>
  )
}
