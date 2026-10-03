import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDateFr, formatMoney, paymentMethodLabels, paymentStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { PrintArea, PrintHeader, SummaryRow } from '@/components/fin/common'
import { PrintButton } from '@/components/fin/print-button'
import { requireStaff } from '@/lib/auth'
import { getAgency } from '@/lib/fin/data'

export const metadata = { title: 'Reçu' }

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('finance', 'read')
  const { id } = await params
  const supabase = await createClient()
  const { data: p } = await supabase.from('payments').select('*, clients(display_name), suppliers(name)').eq('id', id).maybeSingle()
  if (!p) notFound()
  const [{ data: allocations }, agency] = await Promise.all([
    supabase.from('payment_allocations').select('id, amount, invoices(number), dossiers(reference), supplier_invoices(supplier_ref)').eq('payment_id', id),
    getAgency(supabase),
  ])
  const isReceipt = p.direction === 'in'
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/finances/reglements/${id}`} className="text-sm text-brand-600 hover:underline">← Retour au règlement</Link>
        <PrintButton />
      </div>
      <PrintArea>
        <PrintHeader
          agency={agency}
          title={isReceipt ? 'Reçu' : 'Justificatif de paiement'}
          reference={p.reference}
          subtitle={<p>Date : {formatDateFr(p.received_at)}</p>}
        />
        {p.status !== 'validated' ? (
          <p className="mb-4 rounded bg-warning-50 px-3 py-2 text-center text-xs font-semibold text-warning-600">
            Statut : {paymentStatusLabels[p.status]} — {p.status === 'rejected' ? 'règlement rejeté' : 'encaissement sous réserve de bonne fin'}
          </p>
        ) : null}
        <p className="mb-6 text-base">
          {isReceipt ? 'Reçu de' : 'Payé à'} <strong>{p.clients?.display_name ?? p.suppliers?.name}</strong> la somme de{' '}
          <strong className="tabular">{formatMoney(p.amount, p.currency)}</strong>
          {p.currency !== 'TND' ? <> (contre-valeur {formatMoney(p.amount_tnd)} au taux {p.fx_rate})</> : null}{' '}
          par {(paymentMethodLabels[p.method] ?? p.method).toLowerCase()}
          {p.instrument_number ? <> n° {p.instrument_number}</> : null}
          {p.drawer_bank ? <> tiré sur {p.drawer_bank}</> : null}
          {p.due_date ? <>, échéance {formatDateFr(p.due_date)}</> : null}.
        </p>
        {(allocations ?? []).length ? (
          <table className="mb-6 w-full border-collapse text-sm">
            <thead><tr className="border-b-2 border-brand-900 text-left text-xs uppercase text-muted"><th className="py-2">Affecté à</th><th className="py-2 text-right">Montant</th></tr></thead>
            <tbody>
              {(allocations ?? []).map((a) => (
                <tr key={a.id} className="border-b border-line">
                  <td className="py-2">
                    {a.invoices?.number ? `Facture ${a.invoices.number}` : a.supplier_invoices?.supplier_ref ? `Pièce ${a.supplier_invoices.supplier_ref}` : ''}
                    {a.dossiers?.reference ? ` — Dossier ${a.dossiers.reference}` : ''}
                  </td>
                  <td className="py-2 text-right tabular">{formatMoney(a.amount, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="ml-auto w-72">
          <SummaryRow label="Montant" strong>{formatMoney(p.amount, p.currency)}</SummaryRow>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-6 text-xs text-muted">
          <p>Référence externe : {p.external_ref ?? '—'}</p>
          <p className="text-right">Signature et cachet<br /><br /><br /></p>
        </div>
        <p className="mt-8 border-t border-line pt-3 text-center text-[11px] text-muted">
          Un reçu atteste un règlement ; il ne constitue pas une facture. Montants en dinars tunisiens (3 décimales).
        </p>
      </PrintArea>
    </>
  )
}
