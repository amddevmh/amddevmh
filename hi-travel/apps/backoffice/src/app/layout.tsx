import type { Metadata } from 'next'
import { Poppins, Roboto } from 'next/font/google'
import './globals.css'

const poppins = Poppins({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-poppins', display: 'swap' })
const roboto = Roboto({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-roboto', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Back office — HI Travel', template: '%s — Back office HI Travel' },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${poppins.variable} ${roboto.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  )
}
