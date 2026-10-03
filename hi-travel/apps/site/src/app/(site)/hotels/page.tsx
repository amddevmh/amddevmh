import Link from 'next/link'
import type { Metadata } from 'next'
import { formatMoney } from '@hi/core'
import { Alert, Badge, buttonClass } from '@hi/ui'
import { HotelOfferRow } from '@/components/hotel-offer-row'
import { HotelSearchForm } from '@/components/hotel-search-form'
import { Icon } from '@/components/icons'
import { Container, PageHero } from '@/components/page'
import { parseHotelSearchParams, searchHotels } from '@/lib/hotels'
import { t } from '@/lib/i18n'

export const metadata: Metadata = {
  title: t.hotels.metaTitle,
  description: t.activityContent.hotel_tn.metaDescription,
  alternates: { canonical: '/hotels' },
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function timeTunis(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' }).format(new Date(iso))
}

/** Recherche hôtelière Tunisie : deux API fournisseurs interrogées côté serveur (FO05). */
export default async function HotelsPage({ searchParams }: Props) {
  const sp = await searchParams
  const parsed = parseHotelSearchParams(sp)
  const h = t.hotels
  const result = parsed.submitted && parsed.query ? await searchHotels(parsed.query) : null
  const q = parsed.submitted ? parsed.query : undefined

  const active = result?.providers.filter((p) => p.status !== 'disabled') ?? []
  const failed = active.filter((p) => p.status !== 'success')
  const allDown = result != null && active.length > 0 && failed.length === active.length
  const noneEnabled = result != null && active.length === 0

  return (
    <>
      <PageHero title={h.title} intro={h.intro} crumbs={[{ href: '/activites/hotels-tunisie', label: t.activityContent.hotel_tn.title }, { label: h.title }]} />
      <div className="border-b border-line bg-white shadow-sm">
        <Container className="py-5">
          <HotelSearchForm values={q ? { city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, adults: q.adults, children: q.children, rooms: q.rooms, board: q.board } : undefined} />
        </Container>
      </div>

      <Container className="py-10">
        {parsed.submitted && parsed.errors ? (
          <Alert tone="danger" title={t.form.errors.generic}>
            <ul className="list-disc pl-5">{parsed.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Alert>
        ) : null}

        {!parsed.submitted ? (
          <div className="grid gap-6 md:grid-cols-3">
            {t.activityContent.hotel_tn.points.slice(0, 3).map((p) => (
              <div key={p} className="flex gap-3 rounded-card border border-line p-5">
                <Icon name="check" className="size-5 shrink-0 text-success-600" /><p className="text-sm">{p}</p>
              </div>
            ))}
          </div>
        ) : null}

        {result && q ? (
          <section aria-labelledby="results-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="results-title" className="text-2xl font-semibold text-brand-900">{h.resultsTitle(result.hotels.length, q.city)}</h2>
                <p className="mt-1 text-sm text-muted">{h.nightsFor(Math.round((Date.parse(q.checkOut) - Date.parse(q.checkIn)) / 86400000), h.pax(q.adults, q.children))} · {q.rooms} {h.rooms.toLowerCase()}</p>
              </div>
              <p className="flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1 text-sm text-muted" data-testid="freshness">
                <Icon name="clock" className="size-4" /> {h.freshness(timeTunis(result.fetchedAt))}
              </p>
            </div>
            <p className="mt-2 text-xs text-muted">{h.freshnessNote}</p>

            <div className="mt-4 space-y-3" aria-live="polite">
              {noneEnabled ? <Alert tone="warning">{h.noneEnabled}</Alert> : null}
              {allDown ? <Alert tone="warning">{h.allDown}</Alert> : null}
              {!allDown && failed.length > 0 ? <div data-testid="provider-down"><Alert tone="info">{h.providerDown}</Alert></div> : null}
              {!allDown && !noneEnabled && result.hotels.length === 0 ? <Alert tone="info">{h.noResults}</Alert> : null}
            </div>

            <ul className="mt-6 space-y-6" data-testid="hotel-results">
              {result.hotels.map((hotel) => (
                <li key={hotel.key} className="overflow-hidden rounded-card border border-line bg-white shadow-sm" data-provider={hotel.provider}>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-canvas px-5 py-4">
                    <div>
                      <h3 className="text-lg font-semibold text-brand-900">{hotel.name}</h3>
                      <p className="flex items-center gap-1 text-sm text-muted"><Icon name="pin" className="size-4 text-accent-500" />{hotel.city}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone="neutral">{h.source(hotel.providerLabel)}</Badge>
                      {hotel.minPrice != null ? <p className="text-xs text-muted">{t.price.salePrice} dès <span className="font-semibold text-brand-700">{formatMoney(hotel.minPrice)}</span></p> : null}
                    </div>
                  </div>
                  <ul className="px-5">
                    {hotel.offers.map((o, i) => (
                      <HotelOfferRow key={o.offerRef} offer={o} rowId={`${hotel.key.replace(/[^a-zA-Z0-9]/g, '')}-${i}`}
                        query={{ city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, adults: q.adults, children: q.children, rooms: q.rooms }} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <aside className="mt-12 grid gap-4 rounded-card bg-brand-900 p-6 text-white sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">{h.abroadTitle}</h2>
            <p className="mt-1 text-sm text-white/75">{h.abroadText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/activites/hotels-etranger#demande" className={buttonClass('accent', 'md')}>{t.activityContent.hotel_intl.title}</Link>
            <Link href="/activites/billetterie#demande" className={buttonClass('secondary', 'md')}>{t.activityContent.ticketing.title}</Link>
          </div>
        </aside>
      </Container>
    </>
  )
}
