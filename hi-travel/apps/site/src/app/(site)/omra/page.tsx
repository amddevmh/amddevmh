import type { Metadata } from 'next'
import { ActivityPage } from '@/components/activity-page'
import { t } from '@/lib/i18n'
import { getOffers } from '@/lib/site-data'

export const metadata: Metadata = { title: t.omra.title, description: t.omra.metaDescription, alternates: { canonical: '/omra' } }

/** Catégorie dédiée du catalogue : programmes Omra (FO01). */
export default async function OmraPage() {
  const offers = (await getOffers()).filter((o) => o.isOmra)
  return (
    <ActivityPage
      activity="organized_trip"
      category="omra"
      title={t.omra.title}
      intro={t.omra.intro}
      points={t.omra.points}
      offers={offers}
      offersTitle={t.omra.programs}
      emptyText={t.omra.noPrograms}
      crumbs={[{ label: t.omra.title }]}
    />
  )
}
