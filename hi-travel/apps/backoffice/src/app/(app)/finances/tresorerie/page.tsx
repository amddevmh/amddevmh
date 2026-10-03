import Link from 'next/link'
import { formatMoney } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Badge, Card, CardBody, CardHeader, DateText, EmptyState, Field, Input, Select, Table, Td, Th, Textarea, cn } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { FilterBar, PageHeader } from '@/components/page'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { n, sp, todayTunis, type SearchParams } from '@/lib/fin/format'
import { expectedBalanceAt } from '@/lib/fin/treasury'
import { closeCash, setReconciled, transferFunds } from './actions'

export const metadata = { title: 'Caisse et banques' }

const KIND_LABELS: Record<string, string> = {
  receipt: 'Recette', disbursement: 'Dépense', transfer_in: 'Transfert reçu', transfer_out: 'Transfert émis',
  fee: 'Frais', rejection: 'Rejet', adjustment: 'Ajustement',
}

export default async function TreasuryPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('finance', 'read')
  const params = await searchParams
  const supabase = await createClient()
  const { data: balances } = await supabase.from('treasury_balances').select('*').order('kind').order('name')
  const accounts = balances ?? []
  const accountId = sp(params.account) ?? accounts[0]?.id ?? undefined
  const account = accounts.find((a) => a.id === accountId)
  const f = { from: sp(params.from), to: sp(params.to), reconciled: sp(params.reconciled), kind: sp(params.kind) }
  const today = todayTunis()

  let rows: Array<{ id: string; movement_date: string; amount: number; kind: string; label: string; reconciled: boolean; payment_id: string | null; transfer_group_id: string | null; running: number }> = []
  if (account?.id) {
    const { data: mv } = await supabase
      .from('treasury_movements')
      .select('id, movement_date, amount, kind, label, reconciled, payment_id, transfer_group_id, created_at')
      .eq('treasury_account_id', account.id)
      .order('movement_date').order('created_at')
    const opening = Math.round(n(account.opening_balance) * 1000)
    rows = (mv ?? []).reduce<typeof rows>((acc, m) => {
      const prev = acc.length ? Math.round(acc[acc.length - 1]!.running * 1000) : opening
      const delta = m.movement_date >= (account.opening_date ?? '0000') ? Math.round(n(m.amount) * 1000) : 0
      acc.push({ ...m, amount: n(m.amount), running: (prev + delta) / 1000 })
      return acc
    }, [])
    rows = rows.filter((m) =>
      (!f.from || m.movement_date >= f.from) && (!f.to || m.movement_date <= f.to) && (!f.kind || m.kind === f.kind)
      && (!f.reconciled || (f.reconciled === 'yes' ? m.reconciled : !m.reconciled))).reverse()
  }
  const { data: closings } = await supabase.from('cash_closings').select('id, closing_date, expected_balance, counted_balance, difference, justification, treasury_accounts(name)').order('closing_date', { ascending: false }).limit(10)
  const cashAccounts = accounts.filter((a) => a.kind === 'cash')
  const expectedToday = account?.kind === 'cash' && account.id ? await expectedBalanceAt(supabase, account.id, today) : null

  return (
    <>
      <PageHeader
        title="Caisse et banques"
        description="Soldes calculés uniquement à partir des mouvements de chaque compte (FIN04). Un transfert interne produit deux mouvements liés et ne crée pas de revenu."
        breadcrumbs={[{ href: '/finances/reglements', label: 'Finances' }]}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/finances/tresorerie?account=${a.id}`}
            className={cn('rounded-card border bg-surface px-4 py-3 transition-colors hover:border-brand-300', a.id === accountId ? 'border-brand-400 ring-2 ring-brand-100' : 'border-line')}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-brand-900">{a.name}</p>
              <Badge tone={a.kind === 'cash' ? 'accent' : 'brand'}>{a.kind === 'cash' ? 'Caisse' : 'Banque'}</Badge>
            </div>
            <p className="mt-1 font-display text-2xl font-semibold tabular text-brand-900">{formatMoney(a.balance, a.currency ?? 'TND')}</p>
            <p className="text-xs text-muted">Compte {a.account_code} · {a.unreconciled_count ?? 0} mouvement(s) non rapproché(s)</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader title={`Mouvements — ${account?.name ?? ''}`} description={`Solde initial ${formatMoney(account?.opening_balance)} au ${account?.opening_date ?? '—'}. Rapprochement bancaire manuel en phase 1.`} />
            <CardBody className="pb-0">
              <FilterBar>
                <input type="hidden" name="account" value={accountId ?? ''} />
                <div><label className="mb-1 block text-xs text-muted" htmlFor="m-from">Du</label><Input id="m-from" type="date" name="from" defaultValue={f.from ?? ''} /></div>
                <div><label className="mb-1 block text-xs text-muted" htmlFor="m-to">au</label><Input id="m-to" type="date" name="to" defaultValue={f.to ?? ''} /></div>
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor="m-kind">Nature</label>
                  <Select id="m-kind" name="kind" defaultValue={f.kind ?? ''} className="w-40">
                    <option value="">Toutes</option>
                    {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor="m-rec">Rapprochement</label>
                  <Select id="m-rec" name="reconciled" defaultValue={f.reconciled ?? ''} className="w-40">
                    <option value="">Tous</option><option value="no">Non rapprochés</option><option value="yes">Rapprochés</option>
                  </Select>
                </div>
              </FilterBar>
            </CardBody>
            {rows.length === 0 ? <EmptyState title="Aucun mouvement" description="Aucun mouvement pour ce compte et ces filtres." /> : (
              <ActionForm action={setReconciled}>
                <Table>
                  <thead><tr><Th className="w-10" /><Th>Date</Th><Th>Nature</Th><Th>Libellé</Th><Th>Rapproché</Th><Th className="text-right">Montant</Th><Th className="text-right">Solde</Th></tr></thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id}>
                        <Td><input type="checkbox" name="movement_ids" value={m.id} aria-label={`Sélectionner ${m.label}`} /></Td>
                        <Td><DateText value={m.movement_date} /></Td>
                        <Td className="text-xs">
                          {KIND_LABELS[m.kind] ?? m.kind}
                          {m.transfer_group_id ? <span className="block font-mono text-[10px] text-muted">lien {m.transfer_group_id.slice(0, 8)}</span> : null}
                        </Td>
                        <Td className="text-sm">{m.payment_id ? <Link className="text-brand-600 hover:underline" href={`/finances/reglements/${m.payment_id}`}>{m.label}</Link> : m.label}</Td>
                        <Td>{m.reconciled ? <Badge tone="success">Rapproché</Badge> : <Badge>À rapprocher</Badge>}</Td>
                        <MoneyTd value={m.amount} />
                        <MoneyTd value={m.running} className="text-muted" />
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {session.can('finance', 'update') ? (
                  <div className="flex flex-wrap gap-2 px-4 pb-4">
                    <SubmitButton name="value" value="1" variant="secondary" size="sm">Marquer rapprochés (relevé bancaire)</SubmitButton>
                    <SubmitButton name="value" value="0" variant="ghost" size="sm">Annuler le rapprochement</SubmitButton>
                  </div>
                ) : null}
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {session.can('finance', 'create') ? (
            <Card>
              <CardHeader title="Transfert interne" description="Ex. versement de la caisse en banque." />
              <CardBody>
                <ActionForm action={transferFunds} resetOnSuccess>
                  <Field label="De" htmlFor="t-from" required>
                    <Select id="t-from" name="from" defaultValue={cashAccounts[0]?.id ?? ''}>
                      {accounts.map((a) => <option key={a.id} value={a.id ?? ''}>{a.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Vers" htmlFor="t-to" required>
                    <Select id="t-to" name="to" defaultValue={accounts.find((a) => a.kind === 'bank')?.id ?? ''}>
                      {accounts.map((a) => <option key={a.id} value={a.id ?? ''}>{a.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Montant (DT)" htmlFor="t-amount" required><Input id="t-amount" name="amount" inputMode="decimal" required /></Field>
                  <Field label="Date" htmlFor="t-date"><Input id="t-date" name="date" type="date" defaultValue={today} /></Field>
                  <Field label="Libellé" htmlFor="t-label"><Input id="t-label" name="label" defaultValue="Versement caisse en banque" /></Field>
                  <SubmitButton confirm="Enregistrer ce transfert interne ?">Transférer</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {session.can('finance', 'validate') && cashAccounts.length ? (
            <Card>
              <CardHeader title="Clôture de caisse" description="Contrôle du solde physique ; tout écart doit être justifié." />
              <CardBody>
                <ActionForm action={closeCash}>
                  <Field label="Caisse" htmlFor="c-account">
                    <Select id="c-account" name="account" defaultValue={account?.kind === 'cash' ? account.id ?? '' : cashAccounts[0]?.id ?? ''}>
                      {cashAccounts.map((a) => <option key={a.id} value={a.id ?? ''}>{a.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date" htmlFor="c-date"><Input id="c-date" name="date" type="date" defaultValue={today} /></Field>
                  {expectedToday != null ? <p className="text-sm">Solde théorique au {today} : <strong className="tabular">{formatMoney(expectedToday)}</strong></p> : null}
                  <Field label="Solde compté (DT)" htmlFor="c-counted" required><Input id="c-counted" name="counted" inputMode="decimal" required /></Field>
                  <Field label="Justification de l’écart" htmlFor="c-just"><Textarea id="c-just" name="justification" rows={2} /></Field>
                  <SubmitButton confirm="Clôturer la caisse à cette date ?">Clôturer</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Dernières clôtures" />
            {(closings ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucune clôture.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Date</Th><Th>Caisse</Th><Th className="text-right">Écart</Th></tr></thead>
                <tbody>
                  {(closings ?? []).map((c) => (
                    <tr key={c.id}>
                      <Td><DateText value={c.closing_date} /></Td>
                      <Td className="text-sm">{c.treasury_accounts?.name}{c.justification ? <span className="block text-xs text-muted">{c.justification}</span> : null}</Td>
                      <MoneyTd value={c.difference} className={n(c.difference) !== 0 ? 'text-warning-600' : undefined} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
