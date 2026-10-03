import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDateFr, formatMoney } from '@hi/core'
import { createClient } from '@hi/db/server'
import { PrintArea, PrintHeader, SummaryRow } from '@/components/fin/common'
import { PrintButton } from '@/components/fin/print-button'
import { requireStaff } from '@/lib/auth'
import { getAgency } from '@/lib/fin/data'
import { n } from '@/lib/fin/format'

export const metadata = { title: 'Impression' }

const TITLES = { invoice: 'Facture', credit_note: 'Avoir', proforma: 'Facture pro forma' } as const

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('finance', 'read')
  const { id } = await params
  const supabase = await createClient()
  const { data: inv } = await supabase
    .from('invoices')
    .select('*, clients(display_name, address, city, country, tax_id, email, phone), dossiers(reference, title)')
    .eq('id', id)
    .maybeSingle()
  if (!inv) notFound()
  const [{ data: lines }, agency, { data: original }] = await Promise.all([
    supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('position'),
    getAgency(supabase),
    inv.original_invoice_id ? supabase.from('invoices').select('number, issue_date').eq('id', inv.original_invoice_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const draft = inv.status !== 'validated'

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/finances/factures/${id}`} className="text-sm text-brand-600 hover:underline">← Retour à la pièce</Link>
        <PrintButton />
      </div>
      <PrintArea>
        {draft ? <p className="mb-4 rounded bg-warning-50 px-3 py-2 text-center text-xs font-semibold uppercase text-warning-600">Document non validé — sans valeur comptable</p> : null}
        <PrintHeader
          agency={agency}
          title={TITLES[inv.kind]}
          reference={inv.number ?? 'BROUILLON'}
          subtitle={
            <>
              <p>Date : {formatDateFr(inv.issue_date)}</p>
              {inv.kind !== 'credit_note' ? <p>Échéance : {formatDateFr(inv.due_date)}</p> : null}
              {inv.dossiers ? <p>Dossier : {inv.dossiers.reference}</p> : null}
            </>
          }
        />
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Client</p>
            <p className="mt-1 font-semibold text-brand-900">{inv.clients?.display_name}</p>
            {inv.clients?.address ? <p>{inv.clients.address}</p> : null}
            <p>{[inv.clients?.city, inv.clients?.country].filter(Boolean).join(', ')}</p>
            {inv.clients?.tax_id ? <p>MF : {inv.clients.tax_id}</p> : null}
          </div>
          {inv.kind === 'credit_note' ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Référence</p>
              <p className="mt-1">Avoir sur la facture <strong>{original?.number}</strong> du {formatDateFr(original?.issue_date)}</p>
              <p className="mt-1">Motif : {inv.reason}</p>
            </div>
          ) : inv.dossiers ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Voyage</p>
              <p className="mt-1">{inv.dossiers.title}</p>
            </div>
          ) : null}
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-brand-900 text-left text-xs uppercase text-muted">
              <th className="py-2">Désignation</th>
              <th className="py-2 text-right">Qté</th>
              <th className="py-2 text-right">PU HT</th>
              <th className="py-2 text-right">Taxe</th>
              <th className="py-2 text-right">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="py-2 pr-2">{l.description}</td>
                <td className="py-2 text-right tabular">{Number(l.quantity)}</td>
                <td className="py-2 text-right tabular">{formatMoney(l.unit_price)}</td>
                <td className="py-2 text-right tabular">{(Number(l.tax_rate) * 100).toFixed(2)} %</td>
                <td className="py-2 text-right tabular">{formatMoney(l.total_ht)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-6 w-72 text-sm">
          <SummaryRow label="Total HT">{formatMoney(draft ? (lines ?? []).reduce((a, l) => a + n(l.total_ht), 0) : inv.total_ht)}</SummaryRow>
          <SummaryRow label="Taxes">{formatMoney(draft ? (lines ?? []).reduce((a, l) => a + n(l.tax_amount), 0) : inv.total_tax)}</SummaryRow>
          {n(inv.stamp_amount) > 0 ? <SummaryRow label="Droit de timbre">{formatMoney(inv.stamp_amount)}</SummaryRow> : null}
          <SummaryRow label={inv.kind === 'credit_note' ? 'Montant de l’avoir TTC' : 'Total TTC'} strong>
            {draft ? '—' : formatMoney(inv.total_ttc)}
          </SummaryRow>
        </div>
        {inv.kind === 'proforma' ? <p className="mt-6 text-xs text-muted">Facture pro forma : document d’information sans valeur de facture.</p> : null}
        {inv.notes ? <p className="mt-6 whitespace-pre-line text-xs">{inv.notes}</p> : null}
        <p className="mt-10 border-t border-line pt-3 text-center text-[11px] text-muted">
          {agency.name ?? 'HI Travel'} — {[agency.phone, agency.email].filter(Boolean).join(' · ')} — Montants en dinars tunisiens (3 décimales).
        </p>
      </PrintArea>
    </>
  )
}
