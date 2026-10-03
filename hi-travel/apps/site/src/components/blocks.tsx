import Link from 'next/link'
import { ACTIVITIES, type Activity } from '@hi/core'
import { whatsappLink } from '@hi/integrations/messaging'
import { buttonClass, cn } from '@hi/ui'
import { activityHref, activityIcon } from '@/lib/activities'
import { t } from '@/lib/i18n'
import type { Agency } from '@/lib/site-data'
import { Icon, PathIcon } from './icons'
import { telHref } from './site-header'

export function ActivityGrid({ headingLevel = 3, includeOmra = true }: { headingLevel?: 2 | 3; includeOmra?: boolean }) {
  const H = headingLevel === 2 ? 'h2' : 'h3'
  const items: Array<{ key: string; href: string; title: string; short: string; icon: string }> = ACTIVITIES.map((a: Activity) => ({
    key: a, href: activityHref(a), title: t.activityContent[a].title, short: t.activityContent[a].short, icon: activityIcon[a],
  }))
  if (includeOmra) {
    items.push({ key: 'omra', href: '/omra', title: t.omra.title, short: t.omra.points[0]!, icon: 'M12 3l8 4v2H4V7l8-4zM5 9v10M19 9v10M9 9v10M15 9v10M3 21h18' })
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((it) => (
        <li key={it.key}>
          <Link
            href={it.href}
            className="group flex h-full flex-col rounded-card border border-line bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
          >
            <span className="inline-flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-accent-400 group-hover:text-brand-900">
              <PathIcon d={it.icon} />
            </span>
            <H className="mt-4 text-base font-semibold text-brand-900">{it.title}</H>
            <p className="mt-1 text-sm text-muted">{it.short}</p>
            <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-brand-600">
              {t.cta.discover} <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Boutons téléphone / WhatsApp / e-mail : un clic WhatsApp n'est pas une demande CRM (FO04). */
export function ContactButtons({ agency, light, text }: { agency: Agency; light?: boolean; text?: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      {agency.phone ? (
        <a href={telHref(agency.phone)} className={cn(buttonClass(light ? 'secondary' : 'primary', 'lg'))}>
          <Icon name="phone" className="size-5" /> {agency.phone}
        </a>
      ) : null}
      {agency.whatsapp ? (
        <a
          href={whatsappLink(agency.whatsapp, text ?? 'Bonjour HI Travel, ')}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonClass('secondary', 'lg'), 'border-[#25d366]/40 text-[#128c4a] hover:bg-[#25d366]/10')}
        >
          <Icon name="whatsapp" className="size-5" /> {t.cta.whatsapp}<span className="sr-only"> {t.a11y.externalLink}</span>
        </a>
      ) : null}
      {agency.email ? (
        <a href={`mailto:${agency.email}`} className={buttonClass(light ? 'ghost' : 'secondary', 'lg', light ? 'text-white hover:bg-white/10' : undefined)}>
          <Icon name="mail" className="size-5" /> {t.cta.email}
        </a>
      ) : null}
    </div>
  )
}

export function CtaBand({ agency }: { agency: Agency }) {
  return (
    <section aria-labelledby="cta-band" className="bg-gradient-to-r from-brand-600 to-brand-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-xl">
          <h2 id="cta-band" className="text-2xl font-semibold sm:text-3xl">{t.home.ctaBandTitle}</h2>
          <p className="mt-2 text-white/80">{t.home.ctaBandText}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/devis" className={buttonClass('accent', 'lg')}>{t.cta.requestQuote}</Link>
          <Link href="/contact" className={buttonClass('secondary', 'lg')}>{t.cta.contactUs}</Link>
          {agency.phone ? (
            <a href={telHref(agency.phone)} className={buttonClass('ghost', 'lg', 'text-white hover:bg-white/10')}>
              <Icon name="phone" className="size-5" /> {agency.phone}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  )
}
