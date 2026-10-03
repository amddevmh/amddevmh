import Image from 'next/image'
import Link from 'next/link'
import { activityLabels, formatDateFr, formatMoney, priceLabel, type PriceBasis } from '@hi/core'
import { Badge, cn } from '@hi/ui'
import { t } from '@/lib/i18n'
import type { Offer, OfferPhoto } from '@/lib/site-data'
import { Icon } from './icons'

const OPTIMIZED_HOSTS = new Set(['admin.hitravel.tn'])

/**
 * Optimisation next/image pour les domaines autorisés. SITE_IMAGES_UNOPTIMIZED=1 la désactive
 * (environnements dont le serveur ne peut pas joindre l'hébergeur des images).
 */
export function canOptimize(url: string) {
  if (process.env.SITE_IMAGES_UNOPTIMIZED === '1') return false
  try {
    return OPTIMIZED_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Photo d'offre : optimisée (next/image) pour les domaines autorisés, texte alternatif obligatoire. */
export function OfferImage({ photo, fallbackAlt, className, sizes, priority }: { photo?: OfferPhoto; fallbackAlt: string; className?: string; sizes: string; priority?: boolean }) {
  if (!photo) {
    return (
      <div className={cn('flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-900 text-white/70', className)} role="img" aria-label={fallbackAlt}>
        <Icon name="plane" className="size-10" />
      </div>
    )
  }
  return (
    <div className={cn('relative overflow-hidden bg-brand-100', className)}>
      <Image
        src={photo.url}
        alt={photo.alt || fallbackAlt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={!canOptimize(photo.url)}
        className="object-cover"
      />
    </div>
  )
}

/** Prix compact avec sa base (« À partir de », « Prix par personne », « Prix total ») ; acompte distinct. */
export function PriceTag({ amount, basis, currency, occupancy, deposit, compact }: {
  amount: number | null; basis: PriceBasis; currency: string; occupancy?: string | null; deposit?: number | null; compact?: boolean
}) {
  if (amount == null) return <p className="font-medium text-brand-700">{t.price.onRequest}</p>
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted" data-testid="price-basis">{priceLabel(basis)}</p>
      <p className={cn('font-display font-semibold text-brand-700 tabular', compact ? 'text-xl' : 'text-3xl')} data-testid="price-amount">
        {formatMoney(amount, currency)}
      </p>
      {occupancy ? <p className="text-xs text-muted">{occupancy}</p> : null}
      {deposit != null && deposit > 0 ? (
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-accent-50 px-2 py-1 text-xs text-accent-700" data-testid="price-deposit">
          {t.price.depositLabel} : <span className="font-semibold tabular">{formatMoney(deposit, currency)}</span>
        </p>
      ) : null}
    </div>
  )
}

export function OfferCard({ offer, headingLevel = 3, priority }: { offer: Offer; headingLevel?: 2 | 3; priority?: boolean }) {
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-white shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative">
        <OfferImage photo={offer.photos[0]} fallbackAlt={offer.title} className="aspect-[4/3]" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" priority={priority} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge tone="brand" className="bg-white/95">{offer.isOmra ? t.offers.omraBadge : activityLabels[offer.activity]}</Badge>
          {offer.featured ? <Badge tone="accent" className="bg-accent-400 text-brand-900 ring-0">{t.offers.featured}</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1 text-sm text-muted"><Icon name="pin" className="size-4 text-accent-500" />{offer.destination}</p>
        <H className="mt-1 text-lg font-semibold leading-snug text-brand-900">
          <Link href={`/offres/${offer.slug}`} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent-400">
            {offer.title}
          </Link>
        </H>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {offer.durationDays ? <li className="inline-flex items-center gap-1"><Icon name="calendar" className="size-4" />{t.common.days(offer.durationDays)}{offer.nights != null ? ` / ${t.common.nights(offer.nights)}` : ''}</li> : null}
          <li className="inline-flex items-center gap-1">
            <Icon name="clock" className="size-4" />
            {offer.nextDeparture ? `${t.offers.nextDeparture} : ${formatDateFr(offer.nextDeparture)}` : t.offers.noDeparture}
          </li>
        </ul>
        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-3 border-t border-line pt-4">
            <PriceTag amount={offer.priceAmount} basis={offer.priceBasis} currency={offer.currency} occupancy={offer.occupancyBasis} deposit={offer.depositAmount} compact />
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-accent-400 group-hover:text-brand-900" aria-hidden>
              <Icon name="arrowRight" className="size-5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
