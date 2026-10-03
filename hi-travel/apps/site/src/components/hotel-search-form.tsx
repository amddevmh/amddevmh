import { addDays } from '@hi/core'
import { Input, Select, buttonClass, cn } from '@hi/ui'
import { HOTEL_CITIES, BOARD_OPTIONS } from '@/lib/hotel-constants'
import { todayTunis } from '@/lib/forms'
import { t } from '@/lib/i18n'
import { Icon } from './icons'

export interface HotelSearchValues {
  city?: string
  checkIn?: string
  checkOut?: string
  adults?: number
  children?: number
  rooms?: number
  board?: string
}

/** Formulaire GET (URL partageable) de recherche hôtelière Tunisie. */
export function HotelSearchForm({ values, variant = 'full', idPrefix = 'hs' }: { values?: HotelSearchValues; variant?: 'full' | 'compact'; idPrefix?: string }) {
  const today = todayTunis()
  const checkIn = values?.checkIn ?? addDays(today, 14)
  const checkOut = values?.checkOut ?? addDays(checkIn, 3)
  const h = t.hotels
  const id = (n: string) => `${idPrefix}-${n}`
  const compact = variant === 'compact'
  const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted'
  return (
    <form action="/hotels" method="get" role="search" aria-label={t.cta.searchHotels} className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-8')}>
      <div className={cn('col-span-2', !compact && 'lg:col-span-2')}>
        <label htmlFor={id('city')} className={label}>{h.city}</label>
        <Select id={id('city')} name="ville" defaultValue={values?.city ?? HOTEL_CITIES[0]} required>
          {HOTEL_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div>
        <label htmlFor={id('in')} className={label}>{h.checkIn}</label>
        <Input id={id('in')} type="date" name="arrivee" min={today} defaultValue={checkIn} required />
      </div>
      <div>
        <label htmlFor={id('out')} className={label}>{h.checkOut}</label>
        <Input id={id('out')} type="date" name="depart" min={today} defaultValue={checkOut} required />
      </div>
      <div>
        <label htmlFor={id('adults')} className={label}>{h.adults}</label>
        <Input id={id('adults')} type="number" name="adultes" min={1} max={12} defaultValue={values?.adults ?? 2} required />
      </div>
      <div>
        <label htmlFor={id('children')} className={label}>{h.children}</label>
        <Input id={id('children')} type="number" name="enfants" min={0} max={8} defaultValue={values?.children ?? 0} />
      </div>
      <div>
        <label htmlFor={id('rooms')} className={label}>{h.rooms}</label>
        <Input id={id('rooms')} type="number" name="chambres" min={1} max={6} defaultValue={values?.rooms ?? 1} required />
      </div>
      <div className={compact ? '' : 'md:col-span-1'}>
        <label htmlFor={id('board')} className={label}>{h.board}</label>
        <Select id={id('board')} name="pension" defaultValue={values?.board ?? ''}>
          <option value="">{h.anyBoard}</option>
          {BOARD_OPTIONS.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
        </Select>
      </div>
      <div className={cn('col-span-2 flex items-end', !compact && 'md:col-span-4 lg:col-span-8 lg:justify-end')}>
        <button type="submit" className={cn(buttonClass('accent', 'lg'), 'w-full', !compact && 'lg:w-auto')}>
          <Icon name="search" className="size-5" /> {h.search}
        </button>
      </div>
    </form>
  )
}
