import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { formatDateFr } from '@hi/core'
import { Alert, buttonClass } from '@hi/ui'
import { PaymentForm, type PayChoice } from '@/components/portal-forms'
import { PortalShell } from '@/components/portal-shell'
import { todayTunis } from '@/lib/forms'
import { t } from '@/lib/i18n'
import { getPortalSession, scheduleWithStatus, type PortalDossier } from '@/lib/portal'

export const metadata: Metadata = { title: t.payment.title, robots: { index: false } }

type Props = { params: Promise<{ id: string }> }

/** Payer l'acompte ou la prochaine échéance (FO07). */
export default async function PaymentPage({ params }: Props) {
  const { id } = await params
  if (!z.guid().safeParse(id).success) notFound()
  const { supabase, email } = await getPortalSession(`/espace-client/dossiers/${id}/paiement`)
  const { data: dossierRow } = await supabase.from('portal_dossiers').select('id, reference, title, status, currency').eq('id', id).maybeSingle()
  const dossier = dossierRow as Pick<PortalDossier, 'id' | 'reference' | 'title' | 'status' | 'currency'> | null
  if (!dossier) notFound()
  const [{ data: bal }, { data: items }, { data: opts }] = await Promise.all([
    supabase.from('portal_dossier_balances').select('paid, balance').eq('dossier_id', id).maybeSingle(),
    supabase.from('payment_schedule_items').select('id, seq, label, kind, amount, due_date').eq('dossier_id', id).order('seq'),
    supabase.rpc('portal_payment_options'),
  ])
  const options = (opts ?? {}) as { enabled?: boolean; manual_instructions?: string }
  const balance = Number(bal?.balance ?? 0)
  const paid = Number(bal?.paid ?? 0)
  const schedule = scheduleWithStatus((items ?? []).map((s) => ({ ...s, amount: Number(s.amount) })), paid, todayTunis())
  const choices: PayChoice[] = schedule
    .filter((s) => s.rest > 0)
    .map((s) => {
      const amount = Math.min(s.rest, balance)
      return { value: `${s.id}:${amount}`, amount, label: `${s.label}${s.due_date ? ` — échéance du ${formatDateFr(s.due_date)}` : ''}` }
    })
    .filter((c) => c.amount > 0)
  const p = t.payment
  const notPayable = ['cancelled', 'archived', 'request', 'quote_prepared', 'quote_sent'].includes(dossier.status)

  return (
    <PortalShell
      email={email}
      crumbs={[{ href: '/espace-client', label: t.portal.title }, { href: `/espace-client/dossiers/${id}`, label: dossier.reference }, { label: p.title }]}
      title={p.title}
    >
      {!options.enabled ? (
        <Alert tone="warning" title={p.disabledTitle}>
          <p>{p.disabledText}</p>
          {options.manual_instructions ? <p className="mt-1 font-medium">{options.manual_instructions}</p> : null}
        </Alert>
      ) : balance <= 0 ? (
        <Alert tone="success">{p.nothingDue}</Alert>
      ) : notPayable ? (
        <Alert tone="warning">{p.notPayable}</Alert>
      ) : (
        <>
          <p className="mb-6 max-w-3xl text-muted">{p.intro}</p>
          <PaymentForm dossierId={dossier.id} reference={dossier.reference} currency={dossier.currency} balance={balance} choices={choices} />
        </>
      )}
      <Link href={`/espace-client/dossiers/${id}`} className={buttonClass('ghost', 'md', 'mt-8')}>{p.backToDossier}</Link>
    </PortalShell>
  )
}
