import { createClient } from '@hi/db/server'
import { Card, DateText, EmptyState, Input, Select, Table, Td, Th, buttonClass } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { FilterBar, PageHeader } from '@/components/page'
import { AccountingTabs } from '@/components/fin/accounting-tabs'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { lastDayOfMonth, n, sp, todayTunis, type SearchParams } from '@/lib/fin/format'
import { reverseEntry } from '../actions'

export const metadata = { title: 'Journaux' }

export default async function JournalPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('accounting', 'read')
  const params = await searchParams
  const month = sp(params.month) ?? todayTunis().slice(0, 7)
  const journal = sp(params.journal) ?? ''
  const supabase = await createClient()
  let q = supabase.from('general_ledger').select('*')
    .gte('entry_date', `${month}-01`).lte('entry_date', lastDayOfMonth(month))
    .order('entry_date').order('number').order('debit', { ascending: false })
  if (journal) q = q.eq('journal_code', journal)
  const [{ data: lines }, { data: journals }] = await Promise.all([q, supabase.from('journals').select('code, label').order('code')])

  const groups = new Map<string, NonNullable<typeof lines>>()
  for (const l of lines ?? []) {
    const k = l.entry_id ?? ''
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(l)
  }
  const totalD = (lines ?? []).reduce((a, l) => a + n(l.debit), 0)
  const totalC = (lines ?? []).reduce((a, l) => a + n(l.credit), 0)
  const qs = new URLSearchParams({ month, ...(journal ? { journal } : {}) }).toString()

  return (
    <>
      <PageHeader
        title="Comptabilité"
        description="Journal des écritures validées, par journal et par mois. Chaque ligne conserve la référence de la pièce source (FIN06)."
        actions={session.can('accounting', 'export') ? <a className={buttonClass('secondary')} href={`/api/exports/journal?${qs}`}>Exporter CSV</a> : null}
      />
      <AccountingTabs current="/comptabilite/journal" />
      <FilterBar>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-journal">Journal</label>
          <Select id="f-journal" name="journal" defaultValue={journal} className="w-56">
            <option value="">Tous les journaux</option>
            {(journals ?? []).map((j) => <option key={j.code} value={j.code}>{j.code} — {j.label}</option>)}
          </Select>
        </div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-month">Mois</label><Input id="f-month" type="month" name="month" defaultValue={month} /></div>
      </FilterBar>
      <Card>
        {groups.size === 0 ? <EmptyState title="Aucune écriture validée" description="Aucune écriture validée sur ce journal et ce mois." /> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>N°</Th><Th>Jnl</Th><Th>Pièce</Th><Th>Compte</Th><Th>Libellé</Th><Th className="text-right">Débit</Th><Th className="text-right">Crédit</Th><Th /></tr></thead>
            <tbody>
              {[...groups.entries()].map(([entryId, ls]) => ls.map((l, i) => (
                <tr key={l.line_id} className={i === 0 ? 'border-t-2 border-line' : undefined}>
                  <Td>{i === 0 ? <DateText value={l.entry_date} /> : null}</Td>
                  <Td className="font-mono text-xs">{i === 0 ? l.number : null}</Td>
                  <Td className="font-mono text-xs">{i === 0 ? l.journal_code : null}</Td>
                  <Td className="font-mono text-xs">{i === 0 ? l.piece_ref : null}</Td>
                  <Td className="font-mono text-sm">{l.account_code} <span className="font-sans text-xs text-muted">{l.account_label}</span></Td>
                  <Td className="text-sm">{l.label ?? l.entry_label}</Td>
                  <MoneyTd value={n(l.debit) || null} />
                  <MoneyTd value={n(l.credit) || null} />
                  <Td>
                    {i === 0 && session.can('accounting', 'validate') ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-brand-600">Contrepasser</summary>
                        <ActionForm action={reverseEntry} className="mt-2 w-56">
                          <input type="hidden" name="entry_id" value={entryId} />
                          <Input name="reason" placeholder="Motif (obligatoire)" required />
                          <Input name="date" type="date" defaultValue={todayTunis()} />
                          <SubmitButton size="sm" variant="danger" confirm="Contrepasser cette écriture ? Une écriture inverse validée sera créée.">Confirmer</SubmitButton>
                        </ActionForm>
                      </details>
                    ) : null}
                  </Td>
                </tr>
              )))}
              <tr className="font-semibold">
                <Td colSpan={6} className="text-right text-xs uppercase">Totaux du journal</Td>
                <MoneyTd value={totalD} />
                <MoneyTd value={totalC} />
                <Td />
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
