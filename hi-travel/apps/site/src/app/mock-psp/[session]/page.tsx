import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatMoney } from '@hi/core'
import { getPaymentProvider } from '@hi/integrations/payments'
import { t } from '@/lib/i18n'
import { pspDecision } from '../actions'

export const metadata: Metadata = { title: 'MockPay — paiement simulé', robots: { index: false, follow: false } }

type Props = { params: Promise<{ session: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Page hébergée du prestataire de paiement SIMULÉ (environnement de test uniquement). */
export default async function MockPspPage({ params, searchParams }: Props) {
  if ((process.env.INTEGRATIONS_MODE ?? 'mock') !== 'mock') notFound()
  const { session: raw } = await params
  const sp = await searchParams
  const sessionId = decodeURIComponent(raw)
  const session = getPaymentProvider().readSession(sessionId)
  const s = t.psp
  return (
    <div className="min-h-screen bg-[#eef1f6]">
      <div className="bg-[#7a1fa2] px-4 py-3 text-center text-sm font-semibold text-white" role="note">
        {s.banner}
        <span className="block text-xs font-normal text-white/80">{s.bannerText}</span>
      </div>
      <main className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <p className="text-center font-mono text-xl font-bold tracking-tight text-[#7a1fa2]">MockPay</p>
          <h1 className="mt-2 text-center text-lg font-semibold text-gray-900">{s.title}</h1>
          {!session || sp.erreur ? (
            <p className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">{s.invalid}</p>
          ) : (
            <>
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-gray-500">{s.merchant}</dt><dd className="font-medium">HI Travel</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-gray-500">{s.reference}</dt><dd className="font-mono font-medium" data-testid="psp-reference">{session.reference}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-gray-500">{s.description}</dt><dd className="text-right font-medium">{session.description}</dd></div>
                <div className="flex items-baseline justify-between gap-4 border-t pt-3"><dt className="text-gray-500">{s.amount}</dt><dd className="text-2xl font-bold" data-testid="psp-amount">{formatMoney(session.amount, session.currency)}</dd></div>
              </dl>
              <div className="mt-8 grid gap-3">
                <form action={pspDecision.bind(null, sessionId, 'pay')}>
                  <button type="submit" className="h-12 w-full rounded-lg bg-[#7a1fa2] font-semibold text-white hover:bg-[#62198a]">{s.pay}</button>
                </form>
                <div className="grid grid-cols-2 gap-3">
                  <form action={pspDecision.bind(null, sessionId, 'refuse')}>
                    <button type="submit" className="h-11 w-full rounded-lg border border-red-300 font-medium text-red-700 hover:bg-red-50">{s.refuse}</button>
                  </form>
                  <form action={pspDecision.bind(null, sessionId, 'abandon')}>
                    <button type="submit" className="h-11 w-full rounded-lg border border-gray-300 font-medium text-gray-700 hover:bg-gray-50">{s.abandon}</button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
