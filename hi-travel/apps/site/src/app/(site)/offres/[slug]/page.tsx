import Link from 'next/link'
import type { Metadata } from 'next'
import { activityLabels, activitySlugs, boardLabels, formatDateFr, formatMoney, priceLabel } from '@hi/core'
import { Badge, buttonClass, cn } from '@hi/ui'
import { ContactButtons } from '@/components/blocks'
import { AvailabilityBadge, displayAvailability, isBookable } from '@/components/departures'
import { Icon } from '@/components/icons'
import { OfferImage } from '@/components/offer'
import { Container, Breadcrumbs } from '@/components/page'
import { RequestSection } from '@/components/request-section'
import { t } from '@/lib/i18n'
import { notFoundOrRedirect } from '@/lib/redirects'
import { getAgency, getDepartures, getOfferBySlug, type Departure, type Offer } from '@/lib/site-data'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const offer = await getOfferBySlug(slug)
  if (!offer) return { title: t.errors.notFoundTitle, robots: { index: false } }
  const description = offer.seoDescription ?? offer.summary ?? undefined
  const image = offer.photos[0]
  return {
    title: offer.seoTitle ? { absolute: offer.seoTitle } : offer.title,
    description,
    alternates: { canonical: `/offres/${offer.slug}` },
    openGraph: { title: offer.seoTitle ?? offer.title, description, type: 'website', images: image ? [{ url: image.url, alt: image.alt }] : undefined },
  }
}

function boardText(b?: string | null) {
  if (!b) return null
  return b.split('/').map((x) => boardLabels[x.trim()] ?? x.trim()).join(' / ')
}

function JsonLd({ offer, departures }: { offer: Offer; departures: Departure[] }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: offer.title,
    description: offer.summary ?? undefined,
    url: `${base}/offres/${offer.slug}`,
    image: offer.photos.map((p) => p.url),
    touristType: activityLabels[offer.activity],
    offers: offer.priceAmount != null ? {
      '@type': 'Offer',
      price: offer.priceAmount,
      priceCurrency: offer.currency,
      availability: departures.some(isBookable) ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
    } : undefined,
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}

export default async function OfferPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const offer = await getOfferBySlug(slug)
  if (!offer) return notFoundOrRedirect(`/offres/${slug}`)   // offre non publiée ou retirée : 404 (ou redirection)

  const [departures, agency] = await Promise.all([getDepartures(offer.id), getAgency()])
  const wanted = typeof sp.depart === 'string' ? sp.depart : undefined
  const preselect = departures.find((d) => d.id === wanted && isBookable(d))?.id
  const o = t.offer
  const activityHref = offer.isOmra ? '/omra' : `/activites/${activitySlugs[offer.activity]}`

  const facts: Array<[string, string]> = [
    [o.destination, offer.destination],
    ...(offer.durationDays ? [[o.duration, `${t.common.days(offer.durationDays)}${offer.nights != null ? ` / ${t.common.nights(offer.nights)}` : ''}`] as [string, string]] : []),
    ...(offer.board ? [[o.board, boardText(offer.board)!] as [string, string]] : []),
  ]

  return (
    <>
      <JsonLd offer={offer} departures={departures} />
      <div className="border-b border-line bg-canvas">
        <Container className="py-4">
          <Breadcrumbs items={[{ href: '/offres', label: o.breadcrumbs }, { href: activityHref, label: offer.isOmra ? t.nav.omra : t.activityContent[offer.activity].title }, { label: offer.title }]} />
        </Container>
      </div>

      <Container className="py-8 lg:py-10">
        <header className="max-w-4xl">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{offer.isOmra ? t.nav.omra : activityLabels[offer.activity]}</Badge>
            {offer.featured ? <Badge tone="accent">{t.offers.featured}</Badge> : null}
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-brand-900 sm:text-4xl">{offer.title}</h1>
          {offer.summary ? <p className="mt-3 text-lg text-muted">{offer.summary}</p> : null}
        </header>

        {/* Photos */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:grid-rows-2">
          <OfferImage photo={offer.photos[0]} fallbackAlt={o.galleryAlt(offer.title, 1)} priority sizes="(min-width: 640px) 66vw, 100vw" className={cn('aspect-[16/10] rounded-card sm:row-span-2 sm:aspect-auto sm:min-h-[22rem]', offer.photos.length > 1 ? 'sm:col-span-2' : 'sm:col-span-3 sm:min-h-[26rem]')} />
          {offer.photos.slice(1, 3).map((p, i) => (
            <OfferImage key={p.url} photo={p} fallbackAlt={o.galleryAlt(offer.title, i + 2)} sizes="33vw" className="hidden aspect-[4/3] rounded-card sm:block" />
          ))}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0 space-y-12">
            <dl className="grid gap-4 rounded-card border border-line bg-white p-5 sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
                  <dd className="mt-1 font-medium text-brand-900">{v}</dd>
                </div>
              ))}
            </dl>

            {offer.program.length > 0 ? (
              <section aria-labelledby="programme">
                <h2 id="programme" className="text-2xl font-semibold text-brand-900">{o.program}</h2>
                <ol className="mt-6 space-y-0">
                  {offer.program.map((d, i) => (
                    <li key={`${d.day}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < offer.program.length - 1 ? <span aria-hidden className="absolute left-5 top-10 h-[calc(100%-2.5rem)] w-px bg-line" /> : null}
                      <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-sm font-semibold text-white">J{d.day}</span>
                      <div className="pt-1.5">
                        <h3 className="font-semibold text-brand-900"><span className="sr-only">{o.day(d.day)} : </span>{d.title}</h3>
                        {d.description ? <p className="mt-1 text-muted">{d.description}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {offer.hotels.length > 0 || offer.indicativeFlights ? (
              <section aria-labelledby="hebergement" className="grid gap-6 md:grid-cols-2">
                {offer.hotels.length > 0 ? (
                  <div>
                    <h2 id="hebergement" className="text-xl font-semibold text-brand-900">{o.hotels}</h2>
                    <ul className="mt-4 space-y-3">
                      {offer.hotels.map((h, i) => (
                        <li key={i} className="flex gap-3 rounded-card border border-line p-4">
                          <Icon name="bed" className="mt-0.5 size-5 shrink-0 text-accent-500" />
                          <div>
                            <p className="font-medium text-brand-900">{h.name}</p>
                            <p className="text-sm text-muted">
                              {[h.city, h.nights ? t.common.nights(h.nights) : null, h.board ? `${o.board} : ${boardText(h.board)}` : null].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {offer.indicativeFlights ? (
                  <div>
                    <h2 className="text-xl font-semibold text-brand-900">{o.flights}</h2>
                    <p className="mt-4 flex gap-3 rounded-card border border-line p-4 text-sm text-ink"><Icon name="plane" className="size-5 shrink-0 text-accent-500" />{offer.indicativeFlights}</p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {offer.inclusions.length > 0 || offer.exclusions.length > 0 ? (
              <section aria-label={`${o.includes} / ${o.excludes}`} className="grid gap-6 md:grid-cols-2">
                <div className="rounded-card bg-success-50 p-5">
                  <h2 className="text-lg font-semibold text-brand-900">{o.includes}</h2>
                  <ul className="mt-3 space-y-2">
                    {offer.inclusions.map((x) => <li key={x} className="flex gap-2 text-sm"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-success-600" />{x}</li>)}
                  </ul>
                </div>
                <div className="rounded-card bg-canvas p-5">
                  <h2 className="text-lg font-semibold text-brand-900">{o.excludes}</h2>
                  <ul className="mt-3 space-y-2">
                    {offer.exclusions.map((x) => <li key={x} className="flex gap-2 text-sm"><Icon name="close" className="mt-0.5 size-4 shrink-0 text-muted" />{x}</li>)}
                  </ul>
                </div>
              </section>
            ) : null}

            {offer.conditions ? (
              <section aria-labelledby="conditions">
                <h2 id="conditions" className="text-xl font-semibold text-brand-900">{o.conditions}</h2>
                <p className="mt-3 whitespace-pre-line text-ink">{offer.conditions}</p>
              </section>
            ) : null}

            {/* Départs datés */}
            <section aria-labelledby="departs-title" id="departs" className="scroll-mt-28">
              <h2 id="departs-title" className="text-2xl font-semibold text-brand-900">{o.departures}</h2>
              {departures.length === 0 ? (
                <p className="mt-4 rounded-card border border-dashed border-line p-5 text-muted">{o.noDepartures}</p>
              ) : (
                <div className="relative mt-4 overflow-x-auto rounded-card border border-line">
                  <table className="w-full min-w-[560px] text-sm" data-testid="departures-table">
                    <caption className="sr-only">{o.departuresCaption}</caption>
                    <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th scope="col" className="px-4 py-3">{o.dates}</th>
                        <th scope="col" className="px-4 py-3 text-right">{o.priceAdult}</th>
                        <th scope="col" className="px-4 py-3 text-right">{o.deposit}</th>
                        <th scope="col" className="px-4 py-3">{o.availability}</th>
                        <th scope="col" className="px-4 py-3"><span className="sr-only">{o.action}</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {departures.map((d) => {
                        const bookable = isBookable(d)
                        const disp = displayAvailability(d)
                        return (
                          <tr key={d.id} data-availability={d.availability} className={cn(!bookable && 'bg-canvas/60 text-muted')}>
                            <td className="px-4 py-3 font-medium">{formatDateFr(d.startDate)} → {formatDateFr(d.endDate)}</td>
                            <td className="px-4 py-3 text-right tabular">{formatMoney(d.priceAdult, d.currency)}</td>
                            <td className="px-4 py-3 text-right tabular">{d.depositAmount ? formatMoney(d.depositAmount, d.currency) : '—'}</td>
                            <td className="px-4 py-3">
                              <AvailabilityBadge departure={d} />
                              {bookable && disp === 'bookable' ? <span className="ml-2 text-xs text-muted">{o.seatsLeft(d.seatsAvailable)}</span> : null}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {bookable ? (
                                <Link href={`/offres/${offer.slug}?depart=${d.id}#demande`} className={buttonClass('secondary', 'sm')} scroll={false}>{o.chooseDeparture}</Link>
                              ) : (
                                <span className="text-xs">{o.notBookable}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="demande-title" id="demande" className="scroll-mt-28 rounded-card border border-line bg-white p-5 shadow-sm sm:p-8">
              <h2 id="demande-title" className="text-2xl font-semibold text-brand-900">{o.requestTitle}</h2>
              <p className="mt-2 text-muted">{o.requestText}</p>
              <div className="mt-6">
                <RequestSection
                  key={preselect ?? 'none'}
                  activity={offer.activity}
                  category={offer.isOmra ? 'omra' : undefined}
                  offer={{ id: offer.id, title: offer.title }}
                  idPrefix="offer-req"
                  departures={departures.filter((d) => d.availability !== 'closed').map((d) => ({
                    id: d.id,
                    bookable: isBookable(d),
                    label: `${formatDateFr(d.startDate)} → ${formatDateFr(d.endDate)} — ${t.offer.status[displayAvailability(d)]}`,
                  }))}
                  defaults={{ destination: offer.destination, departure_id: preselect, city: offer.destination }}
                />
              </div>
            </section>
          </div>

          {/* Bloc prix : base de prix et acompte distincts */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-card border border-line bg-white p-6 shadow-lg" data-testid="price-block">
              {offer.priceAmount != null ? (
                <>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted" data-testid="price-basis">{priceLabel(offer.priceBasis)}</p>
                  <p className="mt-1 font-display text-4xl font-semibold text-brand-700 tabular" data-testid="price-amount">{formatMoney(offer.priceAmount, offer.currency)}</p>
                  <p className="mt-1 text-sm text-muted">{offer.currency === 'TND' ? 'Dinars tunisiens (TND)' : offer.currency}</p>
                  {offer.occupancyBasis ? <p className="mt-2 text-sm text-ink">{offer.occupancyBasis}</p> : null}
                </>
              ) : (
                <p className="font-display text-2xl font-semibold text-brand-700">{t.price.onRequest}</p>
              )}
              {offer.depositAmount ? (
                <div className="mt-5 rounded-lg bg-accent-50 p-4 ring-1 ring-inset ring-accent-100" data-testid="deposit-block">
                  <p className="text-sm font-semibold text-accent-700">{t.price.depositLabel}</p>
                  <p className="font-display text-xl font-semibold text-brand-900 tabular">{formatMoney(offer.depositAmount, offer.currency)}</p>
                  <p className="mt-1 text-xs text-muted">{t.price.depositNote}</p>
                </div>
              ) : null}
              <a href="#demande" className={buttonClass('accent', 'lg', 'mt-6 w-full')}>{offer.ctaLabel || t.cta.requestQuote}</a>
              <a href="#departs" className={buttonClass('secondary', 'md', 'mt-2 w-full')}>{o.departures}</a>
            </div>
            <div className="mt-4 rounded-card bg-canvas p-5">
              <p className="text-sm font-medium text-brand-900">{t.cta.contactUs}</p>
              <div className="mt-3"><ContactButtons agency={{ ...agency, email: null }} text={`Bonjour HI Travel, je suis intéressé(e) par l’offre « ${offer.title} ».`} /></div>
            </div>
          </aside>
        </div>
      </Container>
    </>
  )
}
