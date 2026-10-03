import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { t } from '@/lib/i18n'

// Pages publiques régénérées au plus toutes les 60 s (les pages à formulaire restent dynamiques)
export const revalidate = 60

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenu" className="sr-only z-50 rounded-md bg-accent-400 px-4 py-2 font-medium text-brand-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t.a11y.skipToContent}
      </a>
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <SiteFooter />
    </div>
  )
}
