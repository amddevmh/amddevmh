import type { Metadata } from 'next'
import { ContactButtons } from '@/components/blocks'
import { Icon } from '@/components/icons'
import { Container, PageHero } from '@/components/page'
import { RequestSection } from '@/components/request-section'
import { t } from '@/lib/i18n'
import { getAgency } from '@/lib/site-data'

export const metadata: Metadata = { title: t.contact.metaTitle, description: t.contact.metaDescription, alternates: { canonical: '/contact' } }

export default async function ContactPage() {
  const agency = await getAgency()
  return (
    <>
      <PageHero title={t.contact.title} intro={t.contact.intro} crumbs={[{ label: t.nav.contact }]} />
      <Container className="py-12">
        <div className="grid gap-10 lg:grid-cols-[22rem_1fr]">
          <aside className="space-y-6">
            <div className="rounded-card border border-line bg-white p-6">
              <h2 className="text-lg font-semibold text-brand-900">{t.footer.contactTitle}</h2>
              <address className="mt-4 space-y-3 text-sm not-italic">
                {agency.address ? <p className="flex gap-2"><Icon name="pin" className="size-4 shrink-0 text-accent-500" />{agency.address}</p> : null}
                {agency.phone ? <p className="flex gap-2"><Icon name="phone" className="size-4 shrink-0 text-accent-500" />{agency.phone}</p> : null}
                {agency.email ? <p className="flex gap-2"><Icon name="mail" className="size-4 shrink-0 text-accent-500" />{agency.email}</p> : null}
              </address>
              <h3 className="mt-5 text-sm font-semibold text-brand-900">{t.footer.hours}</h3>
              <p className="mt-1 flex gap-2 text-sm"><Icon name="clock" className="size-4 shrink-0 text-accent-500" />{agency.hours ?? '—'}</p>
              <div className="mt-5"><ContactButtons agency={{ ...agency, email: null }} /></div>
              <p className="mt-3 text-xs text-muted">{t.footer.whatsappNote}</p>
            </div>
            <div className="rounded-card border border-line bg-canvas p-6" aria-labelledby="map-title">
              <h2 id="map-title" className="text-lg font-semibold text-brand-900">{t.contact.mapTitle}</h2>
              <div className="mt-4 flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg bg-[repeating-linear-gradient(45deg,#eef5fc,#eef5fc_12px,#f6f8fb_12px,#f6f8fb_24px)] text-center text-sm text-muted" role="img" aria-label={t.contact.mapPlaceholder}>
                <Icon name="pin" className="size-8 text-brand-400" />
                <span>{t.contact.mapPlaceholder}</span>
              </div>
            </div>
          </aside>
          <section id="demande" aria-labelledby="contact-form" className="rounded-card border border-line bg-white p-5 shadow-sm sm:p-8">
            <h2 id="contact-form" className="text-2xl font-semibold text-brand-900">{t.contact.formTitle}</h2>
            <p className="mt-2 text-muted">{t.form.noBookingNote}</p>
            <div className="mt-6"><RequestSection activity="tailor_made" idPrefix="contact" /></div>
          </section>
        </div>
      </Container>
    </>
  )
}
