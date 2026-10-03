import { ACTIVITIES, activitySlugs, type Activity } from '@hi/core'
import { t } from './i18n'

/** Variante de formulaire adaptée à chaque activité (FO04). */
export type FormVariant = 'generic' | 'hotel' | 'visa' | 'ticketing' | 'transport' | 'mice'

export const formVariantByActivity: Record<Activity, FormVariant> = {
  hotel_tn: 'hotel',
  hotel_intl: 'hotel',
  tailor_made: 'generic',
  organized_trip: 'generic',
  visa: 'visa',
  ticketing: 'ticketing',
  circuit: 'generic',
  transport: 'transport',
  mice: 'mice',
}

export function activityHref(a: Activity): string {
  return `/activites/${activitySlugs[a]}`
}

export const activityNav = ACTIVITIES.map((a) => ({ activity: a, href: activityHref(a), label: t.activityContent[a].title }))

/** Pictogrammes simples (SVG inline, sans dépendance). */
export const activityIcon: Record<Activity, string> = {
  hotel_tn: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6M3 21h18',
  hotel_intl: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9m0-18C9.5 5.5 8.5 8.5 8.5 12s1 6.5 3.5 9M3.5 9h17M3.5 15h17',
  tailor_made: 'M12 20l-7-7a4.5 4.5 0 016.4-6.4l.6.6.6-.6A4.5 4.5 0 0119 13l-7 7z',
  organized_trip: 'M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 10a3 3 0 100-6 3 3 0 000 6zM21 20v-2a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8',
  visa: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h3',
  ticketing: 'M2.5 19h19M3 13l4 1 4-7 2 .5-2 7.5 5 1.5 3-3 2 .5-2 4.5L3 16z',
  circuit: 'M3 17l5-10 4 6 3-4 6 8H3z',
  transport: 'M4 16V6a2 2 0 012-2h12a2 2 0 012 2v10M4 16h16M4 16v3M20 16v3M7 12h.01M17 12h.01M4 10h16',
  mice: 'M4 5h16v10H4zM8 21l4-6 4 6M12 15v6',
}
