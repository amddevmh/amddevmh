import Link from 'next/link'
import { formatDateFr, formatMoney } from '@hi/core'
import { Badge } from '@hi/ui'
import { t } from '@/lib/i18n'
import type { Availability, Departure, Offer } from '@/lib/site-data'
import { Icon } from './icons'

const TONES: Record<string, 'success' | 'danger' | 'neutral' | 'warning'> = {
  bookable: 'success', full: 'danger', expired: 'neutral', closed: 'neutral', on_request: 'warning',
}

/**
 * Disponibilité publique d'un départ. « Sur demande » lorsque peu de places restent :
 * la disponibilité doit être confirmée par l'agence (FO02).
 */
export function displayAvailability(d: Pick<Departure, 'availability' | 'seatsAvailable'>): Availability | 'on_request' {
  if (d.availability === 'bookable' && d.seatsAvailable <= 2) return 'on_request'
  return d.availability
}

export function isBookable(d: Pick<Departure, 'availability'>) {
  return d.availability === 'bookable'
}

export function AvailabilityBadge({ departure }: { departure: Pick<Departure, 'availability' | 'seatsAvailable'> }) {
  const a = displayAvailability(departure)
  return <Badge tone={TONES[a] ?? 'neutral'} className="text-[0.8rem]">{t.offer.status[a] ?? a}</Badge>
}

export function UpcomingDepartures({ items }: { items: Array<Departure & { offer: Offer }> }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
      {items.map((d) => (
        <li key={d.id} className="relative flex flex-col gap-3 p-4 transition-colors hover:bg-brand-50/50 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
          <div className="flex w-full items-center gap-4 sm:w-56 sm:shrink-0">
            <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-900 text-white">
              <span className="font-display text-lg font-semibold leading-none">{formatDateFr(d.startDate, { day: '2-digit', month: undefined, year: undefined })}</span>
              <span className="text-[0.7rem] uppercase tracking-wide text-accent-300">{formatDateFr(d.startDate, { day: undefined, month: 'short', year: undefined })}</span>
            </div>
            <div className="text-sm text-muted">
              <p>{t.common.from} {formatDateFr(d.startDate)}</p>
              <p>{t.common.to} {formatDateFr(d.endDate)}</p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-brand-900">
              <Link href={`/offres/${d.offer.slug}#departs`} className="after:absolute after:inset-0">{d.offer.title}</Link>
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><Icon name="pin" className="size-4 text-accent-500" />{d.offer.destination}</p>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <AvailabilityBadge departure={d} />
            {d.priceAdult != null ? (
              <p className="text-right">
                <span className="block text-xs text-muted">{t.price.perPersonAdult}</span>
                <span className="font-display font-semibold text-brand-700 tabular">{formatMoney(d.priceAdult, d.currency)}</span>
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
