import Image from 'next/image'
import Link from 'next/link'
import { whatsappLink } from '@hi/integrations/messaging'
import { activityNav } from '@/lib/activities'
import { t } from '@/lib/i18n'
import { getAgency } from '@/lib/site-data'
import { Icon } from './icons'
import { MainNav } from './main-nav'

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

export async function SiteHeader() {
  const agency = await getAgency()
  const items = [
    { href: '/', label: t.nav.home },
    { href: '/offres', label: t.nav.offers },
    { href: '/omra', label: t.nav.omra },
    { href: '/agence', label: t.nav.agency },
    { href: '/contact', label: t.nav.contact },
  ]
  return (
    <header className="sticky top-0 z-30">
      <div className="hidden bg-brand-900 text-white/90 md:block">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-6 px-4 text-xs sm:px-6 lg:px-8">
          <div className="flex items-center gap-5">
            {agency.phone ? (
              <a href={telHref(agency.phone)} className="inline-flex items-center gap-1.5 hover:text-accent-300">
                <Icon name="phone" className="size-3.5" /> {agency.phone}
              </a>
            ) : null}
            {agency.email ? (
              <a href={`mailto:${agency.email}`} className="inline-flex items-center gap-1.5 hover:text-accent-300">
                <Icon name="mail" className="size-3.5" /> {agency.email}
              </a>
            ) : null}
            {agency.hours ? (
              <span className="hidden items-center gap-1.5 lg:inline-flex"><Icon name="clock" className="size-3.5" /> {agency.hours}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            {agency.whatsapp ? (
              <a href={whatsappLink(agency.whatsapp, 'Bonjour HI Travel, ')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-accent-300">
                <Icon name="whatsapp" className="size-3.5" /> {t.cta.whatsapp}<span className="sr-only"> {t.a11y.externalLink}</span>
              </a>
            ) : null}
            <Link href="/contact" className="hover:text-accent-300">{t.cta.contactUs}</Link>
          </div>
        </div>
      </div>
      <div className="relative border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
          <Link href="/" className="flex shrink-0 items-center rounded-md" aria-label={`${t.brand.name} — ${t.nav.home}`}>
            <Image src="/hi-travel-logo.png" alt={t.brand.name} width={170} height={50} priority className="h-9 w-auto lg:h-11" />
          </Link>
          <MainNav
            items={items}
            activitiesAfter={2}
            activities={activityNav.map(({ href, label }) => ({ href, label }))}
            phone={agency.phone ? { href: telHref(agency.phone), label: agency.phone } : undefined}
            labels={{
              activities: t.nav.activities, allActivities: t.nav.allActivities, openMenu: t.a11y.openMenu, closeMenu: t.a11y.closeMenu,
              mainNav: t.a11y.mainNav, clientSpace: t.nav.clientSpace, requestQuote: t.cta.requestQuote, contactUs: t.cta.contactUs,
            }}
          />
        </div>
      </div>
    </header>
  )
}
