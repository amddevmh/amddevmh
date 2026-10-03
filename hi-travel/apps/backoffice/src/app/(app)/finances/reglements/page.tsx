import Link from 'next/link'
import { formatMoney, paymentMethodLabels, paymentStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Card, CardBody, CardHeader, DateText, EmptyState, Field, Input, Select, Stat, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { FilterBar, PageHeader } from '@/components/page'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { listClients, listSuppliers, listTreasuryAccounts } from '@/lib/fin/data'
import { n, sp, todayTunis, type SearchParams } from '@/lib/fin/format'
import { createDepositSlip } from './actions'

export const metadata = { title: 'Règlements' }

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('finance', 'read')
  const params = await searchParams
  const f = {
    status: sp(params.status), method: sp(params.method), direction: sp(params.direction), client: sp(params.client),
    supplier: sp(params.supplier), q: sp(params.q), from: sp(params.from), to: sp(params.to), unallocated: sp(params.unallocated),
  }
  const supabase = await createClient()
  let q = supabase
    .from('payments')
    .select('id, reference, direction, kind, method, amount, currency, amount_tnd, status, received_at, due_date, instrument_number, client_id, supplier_id, deposit_slip_id, clients(display_name), suppliers(name)')
    .order('received_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)
  if (f.status) q = q.eq('status', f.status as 'received')
  if (f.method) q = q.eq('method', f.method as 'cash')
  if (f.direction) q = q.eq('direction', f.direction)
  if (f.client) q = q.eq('client_id', f.client)
  if (f.supplier) q = q.eq('supplier_id', f.supplier)
  if (f.q) q = q.or(`reference.ilike.%${f.q.replace(/[,()]/g, '')}%,instrument_number.ilike.%${f.q.replace(/[,()]/g, '')}%,external_ref.ilike.%${f.q.replace(/[,()]/g, '')}%`)
  if (f.from) q = q.gte('received_at', f.from)
  if (f.to) q = q.lte('received_at', f.to)

  const [{ data: payments }, { data: unalloc }, clients, suppliers, accounts, { data: toDeposit }, { data: slips }] = await Promise.all([
    q,
    supabase.from('payment_unallocated').select('payment_id, unallocated').gt('unallocated', 0),
    listClients(supabase),
    listSuppliers(supabase),
    listTreasuryAccounts(supabase),
    supabase.from('payments').select('id, reference, method, amount, received_at, due_date, instrument_number, drawer_bank, clients(display_name)')
      .in('method', ['cheque', 'bill']).eq('status', 'received').eq('direction', 'in').order('due_date', { nullsFirst: false }),
    supabase.from('deposit_slips').select('id, reference, deposit_date, total_amount, treasury_accounts(name)').order('created_at', { ascending: false }).limit(10),
  ])
  const unallocById = new Map((unalloc ?? []).map((u) => [u.payment_id, n(u.unallocated)]))
  let rows = payments ?? []
  if (f.unallocated) rows = rows.filter((p) => (unallocById.get(p.id) ?? 0) > 0 && p.status !== 'rejected' && p.status !== 'cancelled')
  const today = todayTunis()
  const pending = rows.filter((p) => p.status === 'received' || p.status === 'deposited')
  const validatedIn = rows.filter((p) => p.status === 'validated' && p.direction === 'in')

  return (
    <>
      <PageHeader
        title="Règlements"
        description="Reçu, remis en banque, validé (encaissement effectif) et rejeté sont des états distincts (FIN02). Une échéance future n’est pas un encaissement disponible."
        actions={
          <>
            {session.can('finance', 'export') ? <a className={buttonClass('secondary')} href={`/api/exports/reglements?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString()}`}>Exporter CSV</a> : null}
            {session.can('finance', 'create') ? <Link className={buttonClass('primary')} href="/finances/reglements/nouveau">Nouveau règlement</Link> : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Validés (entrées)" value={formatMoney(validatedIn.reduce((a, p) => a + n(p.amount_tnd), 0))} hint="Encaissements effectifs — pas du chiffre d’affaires" href="/finances/reglements?status=validated&direction=in" />
        <Stat label="Reçus non encore validés" value={pending.length} hint="Chèques, traites et virements à confirmer" href="/finances/reglements?status=received" tone={pending.length ? 'warning' : 'neutral'} />
        <Stat label="Chèques / traites à remettre" value={(toDeposit ?? []).length} href="#remise" />
        <Stat label="Non affectés" value={[...unallocById.values()].length} hint="Règlements avec solde non affecté" href="/finances/reglements?unallocated=1" />
      </div>

      <FilterBar>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-status">Statut</label>
          <Select id="f-status" name="status" defaultValue={f.status ?? ''} className="w-40">
            <option value="">Tous</option>
            {Object.entries(paymentStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-method">Moyen</label>
          <Select id="f-method" name="method" defaultValue={f.method ?? ''} className="w-36">
            <option value="">Tous</option>
            {Object.entries(paymentMethodLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-direction">Sens</label>
          <Select id="f-direction" name="direction" defaultValue={f.direction ?? ''} className="w-32">
            <option value="">Tous</option><option value="in">Entrées</option><option value="out">Sorties</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-client">Client</label>
          <Select id="f-client" name="client" defaultValue={f.client ?? ''} className="w-48">
            <option value="">Tous</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-supplier">Fournisseur</label>
          <Select id="f-supplier" name="supplier" defaultValue={f.supplier ?? ''} className="w-48">
            <option value="">Tous</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-q">Référence / n° chèque</label>
          <Input id="f-q" name="q" defaultValue={f.q ?? ''} className="w-40" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-from">Du</label>
          <Input id="f-from" type="date" name="from" defaultValue={f.from ?? ''} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-to">au</label>
          <Input id="f-to" type="date" name="to" defaultValue={f.to ?? ''} />
        </div>
      </FilterBar>

      <Card className="mb-6">
        {rows.length === 0 ? <EmptyState title="Aucun règlement" description="Aucun règlement ne correspond aux filtres." /> : (
          <Table>
            <thead>
              <tr><Th>Référence</Th><Th>Date</Th><Th>Tiers</Th><Th>Sens</Th><Th>Moyen</Th><Th>Statut</Th><Th>Échéance</Th><Th className="text-right">Montant</Th><Th className="text-right">Non affecté</Th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-canvas/60">
                  <Td><Link className="font-medium text-brand-600 hover:underline" href={`/finances/reglements/${p.id}`}>{p.reference}</Link></Td>
                  <Td><DateText value={p.received_at} /></Td>
                  <Td>{p.clients?.display_name ?? p.suppliers?.name}</Td>
                  <Td className="text-xs">{p.direction === 'in' ? 'Entrée' : 'Sortie'}{p.kind !== 'payment' ? ` · ${p.kind === 'refund' ? 'remboursement' : 'contre-écriture'}` : ''}</Td>
                  <Td>{paymentMethodLabels[p.method]}{p.instrument_number ? <span className="block text-xs text-muted">n° {p.instrument_number}</span> : null}</Td>
                  <Td><StatusBadge status={p.status} labels={paymentStatusLabels} /></Td>
                  <Td><DateText value={p.due_date} className={p.due_date && p.due_date > today ? 'text-warning-600' : undefined} /></Td>
                  <MoneyTd value={p.amount} currency={p.currency} strong />
                  <MoneyTd value={unallocById.get(p.id) ?? 0} currency={p.currency} className={(unallocById.get(p.id) ?? 0) > 0 ? 'text-warning-600' : 'text-muted'} />
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div id="remise" className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Remise en banque" description="Chèques et traites reçus, non encore remis. Le bordereau liste les valeurs remises ; l’encaissement reste à valider à réception de l’avis bancaire." />
          {(toDeposit ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucune valeur à remettre.</p></CardBody> : session.can('finance', 'create') ? (
            <CardBody>
              <ActionForm action={createDepositSlip}>
                <Table>
                  <thead><tr><Th className="w-10" /><Th>Référence</Th><Th>Client</Th><Th>N°</Th><Th>Banque tirée</Th><Th>Échéance</Th><Th className="text-right">Montant</Th></tr></thead>
                  <tbody>
                    {(toDeposit ?? []).map((p) => (
                      <tr key={p.id}>
                        <Td><input type="checkbox" name="payment_ids" value={p.id} aria-label={`Remettre ${p.reference}`} defaultChecked={!p.due_date || p.due_date <= today} /></Td>
                        <Td><Link className="text-brand-600 hover:underline" href={`/finances/reglements/${p.id}`}>{p.reference}</Link></Td>
                        <Td>{p.clients?.display_name}</Td>
                        <Td>{paymentMethodLabels[p.method]} {p.instrument_number}</Td>
                        <Td>{p.drawer_bank ?? '—'}</Td>
                        <Td><DateText value={p.due_date} className={p.due_date && p.due_date > today ? 'text-warning-600' : undefined} /></Td>
                        <MoneyTd value={p.amount} />
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Compte bancaire de remise" htmlFor="treasury_account_id" required>
                    <Select id="treasury_account_id" name="treasury_account_id" defaultValue={accounts.find((a) => a.kind === 'bank')?.id}>
                      {accounts.filter((a) => a.kind === 'bank' && a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date de remise" htmlFor="deposit_date"><Input id="deposit_date" name="deposit_date" type="date" defaultValue={today} /></Field>
                  <div className="flex items-end"><SubmitButton confirm="Créer le bordereau de remise pour les valeurs cochées ?">Créer le bordereau</SubmitButton></div>
                </div>
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>
        <Card>
          <CardHeader title="Derniers bordereaux" />
          {(slips ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucun bordereau.</p></CardBody> : (
            <ul className="divide-y divide-line">
              {(slips ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>
                    <Link className="font-medium text-brand-600 hover:underline" href={`/finances/reglements/bordereaux/${s.id}`}>{s.reference}</Link>
                    <span className="block text-xs text-muted">{s.treasury_accounts?.name} · <DateText value={s.deposit_date} /></span>
                  </span>
                  <span className="tabular">{formatMoney(s.total_amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
