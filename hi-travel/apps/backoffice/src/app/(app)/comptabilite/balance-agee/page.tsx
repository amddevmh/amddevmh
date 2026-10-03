import Link from 'next/link'
import { addDays } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Card, CardHeader, EmptyState, Table, Td, Th, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { AccountingTabs } from '@/components/fin/accounting-tabs'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { n, todayTunis } from '@/lib/fin/format'

export const metadata = { title: 'Balance âgée' }

export default async function AgedPage() {
  const session = await requireStaff('accounting', 'read')
  const supabase = await createClient()
  const today = todayTunis()
  const [{ data: clients }, { data: sinv }, { data: suppliers }] = await Promise.all([
    supabase.from('aged_receivables').select('*').order('total', { ascending: false }),
    supabase.from('supplier_invoice_balances').select('supplier_id, currency, due_date, remaining').eq('status', 'validated').gt('remaining', 0),
    supabase.from('suppliers').select('id, name'),
  ])
  const names = new Map((suppliers ?? []).map((s) => [s.id, s.name]))
  const d30 = addDays(today, -30)
  const d60 = addDays(today, -60)
  const supplierRows = new Map<string, { supplier_id: string; currency: string; not_due: number; d0_30: number; d31_60: number; d60_plus: number; total: number }>()
  for (const r of sinv ?? []) {
    const key = `${r.supplier_id}:${r.currency}`
    const row = supplierRows.get(key) ?? { supplier_id: r.supplier_id!, currency: r.currency ?? 'TND', not_due: 0, d0_30: 0, d31_60: 0, d60_plus: 0, total: 0 }
    const amt = n(r.remaining)
    const due = r.due_date ?? today
    if (due >= today) row.not_due += amt
    else if (due >= d30) row.d0_30 += amt
    else if (due >= d60) row.d31_60 += amt
    else row.d60_plus += amt
    row.total += amt
    supplierRows.set(key, row)
  }
  const cTot = (k: 'not_due' | 'd0_30' | 'd31_60' | 'd60_plus' | 'total') => (clients ?? []).reduce((a, r) => a + n(r[k]), 0)

  return (
    <>
      <PageHeader
        title="Comptabilité"
        description={`Balance âgée au ${today} : restes dus par ancienneté d’échéance (factures validées nettes d’avoirs et de règlements validés).`}
        actions={session.can('accounting', 'export') ? <a className={buttonClass('secondary')} href="/api/exports/balance-agee">Exporter CSV</a> : null}
      />
      <AccountingTabs current="/comptabilite/balance-agee" />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Clients" />
          {(clients ?? []).length === 0 ? <EmptyState title="Aucune créance client ouverte" /> : (
            <Table>
              <thead><tr><Th>Client</Th><Th className="text-right">Non échu</Th><Th className="text-right">0–30 j</Th><Th className="text-right">31–60 j</Th><Th className="text-right">+60 j</Th><Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {(clients ?? []).map((r) => (
                  <tr key={r.client_id}>
                    <Td><Link className="text-brand-600 hover:underline" href={`/finances/clients/${r.client_id}`}>{r.display_name}</Link></Td>
                    <MoneyTd value={r.not_due} /><MoneyTd value={r.d0_30} /><MoneyTd value={r.d31_60} /><MoneyTd value={r.d60_plus} className={n(r.d60_plus) > 0 ? 'text-danger-700' : undefined} /><MoneyTd value={r.total} strong />
                  </tr>
                ))}
                <tr className="font-semibold">
                  <Td className="text-right text-xs uppercase">Totaux</Td>
                  <MoneyTd value={cTot('not_due')} /><MoneyTd value={cTot('d0_30')} /><MoneyTd value={cTot('d31_60')} /><MoneyTd value={cTot('d60_plus')} /><MoneyTd value={cTot('total')} />
                </tr>
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Fournisseurs" description="Restes dus nets de retenues et de règlements validés, dans la devise de chaque pièce." />
          {supplierRows.size === 0 ? <EmptyState title="Aucune dette fournisseur ouverte" /> : (
            <Table>
              <thead><tr><Th>Fournisseur</Th><Th>Devise</Th><Th className="text-right">Non échu</Th><Th className="text-right">0–30 j</Th><Th className="text-right">31–60 j</Th><Th className="text-right">+60 j</Th><Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {[...supplierRows.values()].map((r) => (
                  <tr key={`${r.supplier_id}:${r.currency}`}>
                    <Td><Link className="text-brand-600 hover:underline" href={`/finances/fournisseurs?supplier=${r.supplier_id}&open=1`}>{names.get(r.supplier_id)}</Link></Td>
                    <Td>{r.currency}</Td>
                    <MoneyTd value={r.not_due} currency={r.currency} /><MoneyTd value={r.d0_30} currency={r.currency} /><MoneyTd value={r.d31_60} currency={r.currency} /><MoneyTd value={r.d60_plus} currency={r.currency} /><MoneyTd value={r.total} currency={r.currency} strong />
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
