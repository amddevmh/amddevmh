import Link from 'next/link'
import type { Metadata } from 'next'
import { buttonClass } from '@hi/ui'
import { ActivityGrid, ContactButtons } from '@/components/blocks'
import { Container, PageHero, RichText } from '@/components/page'
import { t } from '@/lib/i18n'
import { getAgency, getPublicPage } from '@/lib/site-data'

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPage('agence')
  return {
    title: page?.seoTitle ? { absolute: page.seoTitle } : t.agency.metaTitle,
    description: page?.seoDescription ?? t.footer.about,
    alternates: { canonical: '/agence' },
  }
}

export default async function AgencyPage() {
  const [page, agency] = await Promise.all([getPublicPage('agence'), getAgency()])
  return (
    <>
      <PageHero title={page?.title ?? t.agency.metaTitle} crumbs={[{ label: t.nav.agency }]} />
      <Container className="py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
          <div>
            <RichText text={page?.body ?? t.footer.about} />
            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {t.agency.values.map((v) => (
                <li key={v.title} className="rounded-card border border-line p-5">
                  <h2 className="text-lg font-semibold text-brand-900">{v.title}</h2>
                  <p className="mt-2 text-sm text-muted">{v.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <aside className="rounded-card bg-canvas p-6">
            <h2 className="text-lg font-semibold text-brand-900">{t.footer.contactTitle}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              {agency.address ? <div><dt className="font-medium text-muted">{t.footer.address}</dt><dd>{agency.address}</dd></div> : null}
              {agency.hours ? <div><dt className="font-medium text-muted">{t.footer.hours}</dt><dd>{agency.hours}</dd></div> : null}
            </dl>
            <div className="mt-5"><ContactButtons agency={agency} /></div>
            <Link href="/devis" className={buttonClass('accent', 'lg', 'mt-4 w-full')}>{t.cta.requestQuote}</Link>
          </aside>
        </div>
        <h2 className="mt-14 text-2xl font-semibold text-brand-900">{t.activities.title}</h2>
        <div className="mt-6"><ActivityGrid /></div>
      </Container>
    </>
  )
}
