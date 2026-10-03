import Link from 'next/link'
import { buttonClass } from '@hi/ui'
import { Container } from '@/components/page'
import { t } from '@/lib/i18n'

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-6xl font-semibold text-accent-400">404</p>
      <h1 className="mt-4 text-3xl font-semibold text-brand-900">{t.errors.notFoundTitle}</h1>
      <p className="mt-2 text-muted">{t.errors.notFoundText}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonClass('primary', 'lg')}>{t.errors.home}</Link>
        <Link href="/offres" className={buttonClass('secondary', 'lg')}>{t.cta.browseOffers}</Link>
      </div>
    </Container>
  )
}
