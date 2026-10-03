import Link from 'next/link'
import { createClient } from '@hi/db/server'
import { Alert, Card, DateText, EmptyState, Input, Select, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { AccountingTabs } from '@/components/fin/accounting-tabs'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { firstDayOfYear, n, sp, todayTunis, type SearchParams } from '@/lib/fin/format'

export const metadata = { title: 'Grand livre' }

function sourceHref(type: string | null, id: string | null) {
  if (!id) return null
  if (type === 'invoice') return `/finances/factures/${id}`
  if (type === 'payment') return `/finances/reglements/${id}`
  if (type === 'supplier_invoice') return `/finances/fournisseurs/${id}`
  return null
}

export default async function LedgerPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('accounting', 'read')
  const params = await searchParams
  const from = sp(params.from) ?? firstDayOfYear()
  const to = sp(params.to) ?? todayTunis()
  const supabase = await createClient()
  const { data: accounts } = await supabase.from('accounts').select('code, label').order('code')
  const account = sp(params.account) ?? ''
  const [{ data: lines }, { data: tb }] = await Promise.all([
    account
      ? supabase.from('general_ledger').select('*').eq('account_code', account).gte('entry_date', from).lte('entry_date', to).order('entry_date').order('number')
      : Promise.resolve({ data: [] as never[] }),
    account ? supabase.rpc('trial_balance', { p_from: from, p_to: to }) : Promise.resolve({ data: [] as Array<{ account_code: string; debit: number; credit: number; balance: number }> }),
  ])
  const rows = lines ?? []
  // Solde d'ouverture = cumul avant la période (le solde progressif de la vue est cumulé depuis l'origine)
  const first = rows[0]
  const opening = first ? n(first.running_balance) - (n(first.debit) - n(first.credit)) : 0
  const withRunning = rows.reduce<Array<(typeof rows)[number] & { period_running: number }>>((acc, l) => {
    const prev = acc.length ? Math.round(acc[acc.length - 1]!.period_running * 1000) : Math.round(opening * 1000)
    acc.push({ ...l, period_running: (prev + Math.round((n(l.debit) - n(l.credit)) * 1000)) / 1000 })
    return acc
  }, [])
  const pd = rows.reduce((a, l) => a + Math.round(n(l.debit) * 1000), 0) / 1000
  const pc = rows.reduce((a, l) => a + Math.round(n(l.credit) * 1000), 0) / 1000
  const tbRow = (tb ?? []).find((r) => r.account_code === account)
  const concordant = !tbRow || (Math.abs(n(tbRow.debit) - pd) < 0.0005 && Math.abs(n(tbRow.credit) - pc) < 0.0005)

  return (
    <>
      <PageHeader
        title="Comptabilité"
        description="Grand livre par compte : écritures validées, solde progressif et lien vers la pièce source."
        actions={account && session.can('accounting', 'export') ? <a className={buttonClass('secondary')} href={`/api/exports/grand-livre?account=${account}&from=${from}&to=${to}`}>Exporter CSV</a> : null}
      />
      <AccountingTabs current="/comptabilite/grand-livre" />
      <FilterBar>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-account">Compte</label>
          <Select id="f-account" name="account" defaultValue={account} className="w-72">
            <option value="">— Choisir un compte —</option>
            {(accounts ?? []).map((a) => <option key={a.code} value={a.code}>{a.code} — {a.label}</option>)}
          </Select>
        </div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-from">Du</label><Input id="f-from" type="date" name="from" defaultValue={from} /></div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-to">au</label><Input id="f-to" type="date" name="to" defaultValue={to} /></div>
      </FilterBar>
      {account && tbRow ? (
        <Alert tone={concordant ? 'success' : 'danger'} className="mb-4">
          {concordant
            ? `Concordance vérifiée avec la balance sur la même période : débit ${pd.toFixed(3)} / crédit ${pc.toFixed(3)}.`
            : 'Écart entre le grand livre et la balance sur la même période : à analyser.'}
        </Alert>
      ) : null}
      <Card>
        {!account ? <EmptyState title="Choisissez un compte" /> : withRunning.length === 0 ? <EmptyState title="Aucune écriture validée" description="Aucun mouvement validé sur ce compte et cette période." /> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>N°</Th><Th>Jnl</Th><Th>Pièce</Th><Th>Libellé</Th><Th className="text-right">Débit</Th><Th className="text-right">Crédit</Th><Th className="text-right">Solde</Th></tr></thead>
            <tbody>
              <tr className="text-muted"><Td colSpan={7} className="text-right text-xs uppercase">Solde au {from}</Td><MoneyTd value={opening} /></tr>
              {withRunning.map((l) => {
                const href = sourceHref(l.source_type, l.source_id)
                return (
                  <tr key={l.line_id}>
                    <Td><DateText value={l.entry_date} /></Td>
                    <Td className="font-mono text-xs">{l.number}</Td>
                    <Td className="font-mono text-xs">{l.journal_code}</Td>
                    <Td className="font-mono text-xs">{href ? <Link className="text-brand-600 hover:underline" href={href}>{l.piece_ref}</Link> : l.piece_ref}</Td>
                    <Td className="text-sm">{l.label ?? l.entry_label}</Td>
                    <MoneyTd value={n(l.debit) || null} />
                    <MoneyTd value={n(l.credit) || null} />
                    <MoneyTd value={l.period_running} />
                  </tr>
                )
              })}
              <tr className="font-semibold">
                <Td colSpan={5} className="text-right text-xs uppercase">Mouvements de la période</Td>
                <MoneyTd value={pd} />
                <MoneyTd value={pc} />
                <MoneyTd value={pd - pc} />
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
