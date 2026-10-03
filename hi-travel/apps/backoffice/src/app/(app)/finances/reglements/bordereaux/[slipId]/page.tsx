import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDateFr, formatMoney, paymentMethodLabels, paymentStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { PrintArea, PrintHeader, SummaryRow } from '@/components/fin/common'
import { PrintButton } from '@/components/fin/print-button'
import { requireStaff } from '@/lib/auth'
import { getAgency } from '@/lib/fin/data'

export const metadata = { title: 'Bordereau de remise' }

export default async function DepositSlipPage({ params }: { params: Promise<{ slipId: string }> }) {
  await requireStaff('finance', 'read')
  const { slipId } = await params
  const supabase = await createClient()
  const { data: slip } = await supabase.from('deposit_slips').select('*, treasury_accounts(name, bank_name, iban)').eq('id', slipId).maybeSingle()
  if (!slip) notFound()
  const [{ data: payments }, agency] = await Promise.all([
    supabase.from('payments').select('id, reference, method, amount, instrument_number, drawer_bank, due_date, status, clients(display_name)').eq('deposit_slip_id', slipId).order('reference'),
    getAgency(supabase),
  ])
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/finances/reglements#remise" className="text-sm text-brand-600 hover:underline">← Retour aux règlements</Link>
        <PrintButton />
      </div>
      <PrintArea>
        <PrintHeader
          agency={agency}
          title="Bordereau de remise"
          reference={slip.reference}
          subtitle={<><p>Date de remise : {formatDateFr(slip.deposit_date)}</p><p>{slip.treasury_accounts?.name}</p></>}
        />
        <p className="mb-4 text-sm">
          Banque : <strong>{slip.treasury_accounts?.bank_name ?? '—'}</strong>
          {slip.treasury_accounts?.iban ? <> — RIB/IBAN : <span className="font-mono">{slip.treasury_accounts.iban}</span></> : null}
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-brand-900 text-left text-xs uppercase text-muted">
              <th className="py-2">Valeur</th><th className="py-2">N°</th><th className="py-2">Tireur</th><th className="py-2">Banque tirée</th><th className="py-2">Échéance</th><th className="py-2">État</th><th className="py-2 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p) => (
              <tr key={p.id} className="border-b border-line">
                <td className="py-2">{paymentMethodLabels[p.method]}</td>
                <td className="py-2 font-mono">{p.instrument_number}</td>
                <td className="py-2">{p.clients?.display_name}</td>
                <td className="py-2">{p.drawer_bank ?? '—'}</td>
                <td className="py-2">{formatDateFr(p.due_date)}</td>
                <td className="py-2 text-xs">{paymentStatusLabels[p.status]}</td>
                <td className="py-2 text-right tabular">{formatMoney(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-6 w-72 text-sm">
          <SummaryRow label="Nombre de valeurs">{(payments ?? []).length}</SummaryRow>
          <SummaryRow label="Total remis" strong>{formatMoney(slip.total_amount)}</SummaryRow>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-6 text-xs text-muted">
          <p>Remis par : ……………………</p>
          <p className="text-right">Cachet de la banque</p>
        </div>
      </PrintArea>
    </>
  )
}
