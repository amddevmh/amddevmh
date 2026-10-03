import type { Metadata, Viewport } from 'next'
import { Poppins, Roboto } from 'next/font/google'
import { t } from '@/lib/i18n'
import './globals.css'

const poppins = Poppins({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-poppins', display: 'swap' })
const roboto = Roboto({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-roboto', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'HI Travel — Agence de voyages en Tunisie', template: '%s | HI Travel' },
  description: 'Hôtels en Tunisie et à l’étranger, voyages organisés, Omra, visa, billetterie, circuits, transport et événements.',
  applicationName: 'HI Travel',
  openGraph: { siteName: 'HI Travel', locale: 'fr_TN', type: 'website' },
}

export const viewport: Viewport = {
  themeColor: '#131a47',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={t.locale} dir={t.dir} className={`${poppins.variable} ${roboto.variable}`}>
      <body className="min-h-screen bg-white font-sans text-ink">{children}</body>
    </html>
  )
}
