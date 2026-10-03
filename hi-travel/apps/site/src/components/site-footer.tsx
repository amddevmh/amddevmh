import Image from 'next/image'
import Link from 'next/link'
import { whatsappLink } from '@hi/integrations/messaging'
import { activityNav } from '@/lib/activities'
import { t } from '@/lib/i18n'
import { getAgency } from '@/lib/site-data'
import { Icon, type IconName } from './icons'
import { telHref } from './site-header'

const SOCIAL_ICONS: Record<string, IconName> = { facebook: 'facebook', instagram: 'instagram' }
const SOCIAL_LABELS: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram' }

export async function SiteFooter() {
  const agency = await getAgency()
  const year = new Date().getFullYear()
  const socials = Object.entries(agency.socials).filter(([, url]) => typeof url === 'string' && /^https:\/\//.test(url)) as [string, string][]
  return (
    <footer className="mt-auto bg-brand-900 text-white/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <Image src="/hi-travel-logo.png" alt={t.brand.name} width={170} height={50} className="h-11 w-auto brightness-0 invert" />
          <p className="mt-4 text-sm leading-relaxed">{t.footer.about}</p>
          {socials.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{t.footer.follow}</p>
              <ul className="mt-2 flex gap-2">
                {socials.map(([k, url]) => (
                  <li key={k}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent-400 hover:text-brand-900">
                      <Icon name={SOCIAL_ICONS[k] ?? 'arrowRight'} className="size-5" />
                      <span className="sr-only">{SOCIAL_LABELS[k] ?? k} {t.a11y.externalLink}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <nav aria-label={t.footer.activitiesTitle}>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-white">{t.footer.activitiesTitle}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {activityNav.map((a) => (
              <li key={a.href}><Link href={a.href} className="hover:text-accent-300">{a.label}</Link></li>
            ))}
            <li><Link href="/omra" className="hover:text-accent-300">{t.nav.omra}</Link></li>
          </ul>
        </nav>

        <nav aria-label={t.footer.infoTitle}>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-white">{t.footer.infoTitle}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link href="/offres" className="hover:text-accent-300">{t.nav.offers}</Link></li>
            <li><Link href="/hotels" className="hover:text-accent-300">{t.nav.hotels}</Link></li>
            <li><Link href="/agence" className="hover:text-accent-300">{t.nav.agency}</Link></li>
            <li><Link href="/devis" className="hover:text-accent-300">{t.cta.requestQuote}</Link></li>
            <li><Link href="/espace-client" className="hover:text-accent-300">{t.nav.clientSpace}</Link></li>
            <li><Link href="/conditions-de-vente" className="hover:text-accent-300">{t.footer.terms}</Link></li>
            <li><Link href="/confidentialite" className="hover:text-accent-300">{t.footer.privacy}</Link></li>
            <li><Link href="/mentions-legales" className="hover:text-accent-300">{t.footer.legal}</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-white">{t.footer.contactTitle}</h2>
          <address className="mt-4 space-y-3 text-sm not-italic">
            {agency.address ? (
              <p className="flex gap-2"><Icon name="pin" className="mt-0.5 size-4 shrink-0 text-accent-400" /><span><span className="sr-only">{t.footer.address} : </span>{agency.address}</span></p>
            ) : null}
            {agency.phone ? (
              <p><a href={telHref(agency.phone)} className="flex gap-2 hover:text-accent-300"><Icon name="phone" className="mt-0.5 size-4 shrink-0 text-accent-400" />{agency.phone}</a></p>
            ) : null}
            {agency.whatsapp ? (
              <p><a href={whatsappLink(agency.whatsapp, 'Bonjour HI Travel, ')} target="_blank" rel="noopener noreferrer" className="flex gap-2 hover:text-accent-300"><Icon name="whatsapp" className="mt-0.5 size-4 shrink-0 text-accent-400" />WhatsApp<span className="sr-only"> {t.a11y.externalLink}</span></a></p>
            ) : null}
            {agency.email ? (
              <p><a href={`mailto:${agency.email}`} className="flex gap-2 hover:text-accent-300"><Icon name="mail" className="mt-0.5 size-4 shrink-0 text-accent-400" />{agency.email}</a></p>
            ) : null}
            {agency.hours ? (
              <p className="flex gap-2"><Icon name="clock" className="mt-0.5 size-4 shrink-0 text-accent-400" /><span><span className="sr-only">{t.footer.hours} : </span>{agency.hours}</span></p>
            ) : null}
          </address>
          <p className="mt-4 text-xs text-white/50">{t.footer.whatsappNote}</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{t.footer.rights(year)}</p>
          <p className="flex gap-4">
            <Link href="/conditions-de-vente" className="hover:text-white">{t.footer.terms}</Link>
            <Link href="/confidentialite" className="hover:text-white">{t.footer.privacy}</Link>
            <Link href="/mentions-legales" className="hover:text-white">{t.footer.legal}</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
