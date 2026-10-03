import Link from 'next/link'
import type { Metadata } from 'next'
import { z } from 'zod'
import { formatDateTimeFr, formatMoney } from '@hi/core'
import { Alert, buttonClass, cn } from '@hi/ui'
import { AutoRefresh } from '@/components/auto-refresh'
import { Icon } from '@/components/icons'
import { PortalShell } from '@/components/portal-shell'
import { t } from '@/lib/i18n'
import { getPortalSession } from '@/lib/portal'

export const metadata: Metadata = { title: t.payment.returnTitle, robots: { index: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Retour navigateur après paiement : affiche UNIQUEMENT le statut enregistré côté serveur
 * (mis à jour par la notification signée). Les paramètres d'URL autres que l'intention sont ignorés.
 */
export default async function PaymentReturnPage({ searchParams }: Props) {
  const sp = await searchParams
  const intentId = typeof sp.intent === 'string' && z.guid().safeParse(sp.intent).success ? sp.intent : null
  const { supabase, email } = await getPortalSession(`/paiement/retour${intentId ? `?intent=${intentId}` : ''}`)
  const p = t.payment
  const { data: intent } = intentId
    ? await supabase.from('payment_intents').select('id, dossier_id, amount, currency, status, updated_at').eq('id', intentId).maybeSingle()
    : { data: null }

  if (!intent) {
    return (
      <PortalShell email={email} crumbs={[{ href: '/espace-client', label: t.portal.title }, { label: p.returnTitle }]} title={p.returnTitle}>
        <Alert tone="danger">{p.intentNotFound}</Alert>
      </PortalShell>
    )
  }
  const { data: dossier } = await supabase.from('portal_dossiers').select('reference').eq('id', intent.dossier_id).maybeSingle()
  const key = intent.status === 'created' ? 'pending' : intent.status
  const content = p.returnStatus[key] ?? p.returnStatus.pending!
  const tone = key === 'succeeded' ? 'success' : key === 'pending' ? 'info' : key === 'failed' ? 'danger' : 'warning'
  const toneCls = { success: 'bg-success-50 text-success-600', info: 'bg-info-50 text-info-600', danger: 'bg-danger-50 text-danger-700', warning: 'bg-warning-50 text-warning-600' }[tone]

  return (
    <PortalShell email={email} crumbs={[{ href: '/espace-client', label: t.portal.title }, { href: `/espace-client/dossiers/${intent.dossier_id}`, label: dossier?.reference ?? '' }, { label: p.returnTitle }]} title={p.returnTitle}>
      {key === 'pending' ? <AutoRefresh /> : null}
      <div className="max-w-2xl rounded-card border border-line bg-white p-6 shadow-sm sm:p-8" data-testid="payment-return" data-status={intent.status} aria-live="polite">
        <span className={cn('inline-flex size-12 items-center justify-center rounded-full', toneCls)}>
          <Icon name={key === 'succeeded' ? 'check' : key === 'pending' ? 'clock' : 'alert'} className="size-6" />
        </span>
        <h2 className="mt-4 text-2xl font-semibold text-brand-900" data-testid="payment-return-title">{content.title}</h2>
        <p className="mt-2 text-ink">{content.text}</p>
        <dl className="mt-6 grid gap-3 rounded-lg bg-canvas p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">{p.reference}</dt><dd className="font-medium">{dossier?.reference}</dd></div>
          <div><dt className="text-muted">{p.amount}</dt><dd className="font-semibold tabular">{formatMoney(intent.amount, intent.currency)}</dd></div>
          <div><dt className="text-muted">Mis à jour</dt><dd className="font-medium">{formatDateTimeFr(intent.updated_at)}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">{p.returnServerNote}</p>
        {key === 'succeeded' ? <p className="mt-2 text-sm font-medium text-warning-600">{p.returnNotConfirmService}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/espace-client/dossiers/${intent.dossier_id}`} className={buttonClass('primary', 'md')}>{p.backToDossier}</Link>
          {key === 'failed' || key === 'abandoned' ? (
            <Link href={`/espace-client/dossiers/${intent.dossier_id}/paiement`} className={buttonClass('secondary', 'md')}>{p.retry}</Link>
          ) : null}
        </div>
      </div>
    </PortalShell>
  )
}
