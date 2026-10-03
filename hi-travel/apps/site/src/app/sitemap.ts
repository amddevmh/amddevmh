import type { MetadataRoute } from 'next'
import { ACTIVITIES, activitySlugs } from '@hi/core'
import { getOffers, getPublicPages } from '@/lib/site-data'

export const revalidate = 3600

/** Plan du site : pages fixes, activités, offres publiées et pages administrables (FO03). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const [offers, pages] = await Promise.all([getOffers().catch(() => []), getPublicPages().catch(() => [])])
  const fixed = ['', '/offres', '/activites', '/omra', '/hotels', '/devis', '/contact']
  return [
    ...fixed.map((p) => ({ url: `${base}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.8 })),
    ...ACTIVITIES.map((a) => ({ url: `${base}/activites/${activitySlugs[a]}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
    ...offers.map((o) => ({ url: `${base}/offres/${o.slug}`, lastModified: o.updatedAt ?? undefined, changeFrequency: 'weekly' as const, priority: 0.9 })),
    ...pages.map((p) => ({ url: `${base}/${p.slug}`, lastModified: p.updatedAt ?? undefined, changeFrequency: 'yearly' as const, priority: 0.3 })),
  ]
}
