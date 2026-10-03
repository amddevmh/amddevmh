import type { Metadata } from 'next'
import { ActivityGrid } from '@/components/blocks'
import { Container, PageHero } from '@/components/page'
import { t } from '@/lib/i18n'

export const metadata: Metadata = { title: t.activities.title, description: t.activities.intro, alternates: { canonical: '/activites' } }

export default function ActivitiesIndex() {
  return (
    <>
      <PageHero title={t.activities.title} intro={t.activities.intro} crumbs={[{ label: t.nav.activities }]} />
      <Container className="py-12"><ActivityGrid headingLevel={2} /></Container>
    </>
  )
}
