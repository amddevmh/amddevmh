import Link from 'next/link'
import { createClient } from '@hi/db/server'
import { Alert, Card, EmptyState, Input, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { AccountingTabs } from '@/components/fin/accounting-tabs'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { firstDayOfYear, n, sp, todayTunis, type SearchParams } from '@/lib/fin/format'

export const metadata = { title: 'Balance' }

export default async function TrialBalancePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('accounting', 'read')
  const params = await searchParams
  const from = sp(params.from) ?? firstDayOfYear()
  const to = sp(params.to) ?? todayTunis()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('trial_balance', { p_from: from, p_to: to })
  const rows = data ?? []
  const d = rows.reduce((a, r) => a + Math.round(n(r.debit) * 1000), 0) / 1000
  const c = rows.reduce((a, r) => a + Math.round(n(r.credit) * 1000), 0) / 1000
  const balanced = d === c

  return (
    <>
      <PageHeader
        title="Comptabilité"
        description={`Balance générale des écritures validées du ${from} au ${to}.`}
        actions={session.can('accounting', 'export') ? <a className={buttonClass('secondary')} href={`/api/exports/balance?from=${from}&to=${to}`}>Exporter CSV</a> : null}
      />
      <AccountingTabs current="/comptabilite/balance" />
      <FilterBar>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-from">Du</label><Input id="f-from" type="date" name="from" defaultValue={from} /></div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-to">au</label><Input id="f-to" type="date" name="to" defaultValue={to} /></div>
      </FilterBar>
      {error ? <Alert tone="danger" className="mb-4">{error.message}</Alert> : null}
      {rows.length ? (
        <Alert tone={balanced ? 'success' : 'danger'} className="mb-4">
          {balanced ? `Balance équilibrée : total débit = total crédit = ${d.toFixed(3)} DT.` : `Balance déséquilibrée : débit ${d.toFixed(3)} ≠ crédit ${c.toFixed(3)}.`}
        </Alert>
      ) : null}
      <Card>
        {rows.length === 0 ? <EmptyState title="Aucune écriture validée sur la période" /> : (
          <Table>
            <thead><tr><Th>Compte</Th><Th>Libellé</Th><Th className="text-right">Débit</Th><Th className="text-right">Crédit</Th><Th className="text-right">Solde débiteur</Th><Th className="text-right">Solde créditeur</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account_code}>
                  <Td className="font-mono">
                    <Link className="text-brand-600 hover:underline" href={`/comptabilite/grand-livre?account=${r.account_code}&from=${from}&to=${to}`}>{r.account_code}</Link>
                  </Td>
                  <Td>{r.account_label ?? <span className="text-danger-700">compte inconnu</span>}</Td>
                  <MoneyTd value={r.debit} />
                  <MoneyTd value={r.credit} />
                  <MoneyTd value={n(r.balance) > 0 ? r.balance : null} />
                  <MoneyTd value={n(r.balance) < 0 ? -n(r.balance) : null} />
                </tr>
              ))}
              <tr className="font-semibold">
                <Td colSpan={2} className="text-right text-xs uppercase">Totaux</Td>
                <MoneyTd value={d} />
                <MoneyTd value={c} />
                <MoneyTd value={rows.reduce((a, r) => a + Math.max(n(r.balance), 0), 0)} />
                <MoneyTd value={rows.reduce((a, r) => a + Math.max(-n(r.balance), 0), 0)} />
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
