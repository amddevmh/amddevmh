import type { Metadata } from 'next'
import { Container, PageHero, RichText } from '@/components/page'
import { formatDateFr } from '@hi/core'
import { t } from '@/lib/i18n'
import { notFoundOrRedirect } from '@/lib/redirects'
import { getPublicPage } from '@/lib/site-data'

type Props = { params: Promise<{ path: string[] }> }

/**
 * Pages administrables (conditions de vente, confidentialité, mentions légales…) à adresse stable,
 * puis redirections des anciennes adresses (site_redirects), sinon 404.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params
  const page = path.length === 1 ? await getPublicPage(path[0]!) : null
  if (!page) return { title: t.errors.notFoundTitle, robots: { index: false } }
  return {
    title: page.seoTitle ? { absolute: page.seoTitle } : page.title,
    description: page.seoDescription ?? undefined,
    alternates: { canonical: `/${page.slug}` },
  }
}

export default async function CmsPage({ params }: Props) {
  const { path } = await params
  const segments = path.map((s) => decodeURIComponent(s))
  const page = segments.length === 1 && /^[a-z0-9-]+$/.test(segments[0]!) ? await getPublicPage(segments[0]!) : null
  if (!page) return notFoundOrRedirect(`/${segments.join('/')}`)
  return (
    <>
      <PageHero title={page.title} crumbs={[{ label: page.title }]} />
      <Container className="py-12">
        <article className="max-w-3xl">
          <RichText text={page.body} />
          {page.updatedAt ? <p className="mt-10 text-sm text-muted">Dernière mise à jour : {formatDateFr(page.updatedAt)}</p> : null}
        </article>
      </Container>
    </>
  )
}
