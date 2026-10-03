import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { paymentMethodLabels, paymentStatusLabels, formatMoney } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Card, CardBody, CardHeader, DateText, DefinitionList, Field, Input, Select, StatusBadge, Table, Td, Th, Textarea, buttonClass } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { MoneyTd, SummaryRow, Amount } from '@/components/fin/common'
import { Notice } from '@/components/fin/notice'
import { requireStaff } from '@/lib/auth'
import { listTreasuryAccounts } from '@/lib/fin/data'
import { n, todayTunis, sp, type SearchParams } from '@/lib/fin/format'
import { addAllocation, rejectPayment, reversePayment, validatePayment } from '../actions'

export const metadata = { title: 'Règlement' }

const STEPS = ['received', 'deposited', 'validated'] as const

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requireStaff('finance', 'read')
  const sparams = await searchParams
  const { id } = await params
  const supabase = await createClient()
  const { data: p } = await supabase
    .from('payments')
    .select('*, clients(id, display_name), suppliers(id, name), treasury_accounts(name), deposit_slips(id, reference)')
    .eq('id', id)
    .maybeSingle()
  if (!p) notFound()

  const [{ data: allocations }, { data: un }, { data: movements }, { data: reversal }, accounts] = await Promise.all([
    supabase.from('payment_allocations').select('id, amount, note, created_at, invoice_id, dossier_id, supplier_invoice_id, invoices(number), dossiers(reference), supplier_invoices(supplier_ref)').eq('payment_id', id).order('created_at'),
    supabase.from('payment_unallocated').select('allocated, unallocated').eq('payment_id', id).maybeSingle(),
    supabase.from('treasury_movements').select('id, movement_date, amount, kind, label, reconciled, treasury_accounts(name)').eq('payment_id', id).order('created_at'),
    supabase.from('payments').select('id, reference').eq('reversal_of_id', id).maybeSingle(),
    listTreasuryAccounts(supabase),
  ])
  const original = p.reversal_of_id ? (await supabase.from('payments').select('id, reference').eq('id', p.reversal_of_id).maybeSingle()).data : null

  // Cibles possibles pour affecter le solde non affecté
  let targets: Array<{ value: string; label: string }> = []
  if (n(un?.unallocated) > 0 && !['rejected', 'cancelled'].includes(p.status)) {
    if (p.client_id) {
      const [{ data: inv }, { data: dos }] = await Promise.all([
        p.direction === 'in' ? supabase.from('invoice_balances').select('invoice_id, number, open_amount').eq('client_id', p.client_id).gt('open_amount', 0) : Promise.resolve({ data: [] as Array<{ invoice_id: string | null; number: string | null; open_amount: number | null }> }),
        supabase.from('dossier_financials').select('dossier_id, reference, balance').eq('client_id', p.client_id),
      ])
      targets = [
        ...(inv ?? []).map((i) => ({ value: `invoice:${i.invoice_id}`, label: `Facture ${i.number} — reste ${formatMoney(i.open_amount)}` })),
        ...(dos ?? []).map((d) => ({ value: `dossier:${d.dossier_id}`, label: `Dossier ${d.reference} — solde ${formatMoney(d.balance)}` })),
      ]
    } else if (p.supplier_id) {
      const { data: si } = await supabase.from('supplier_invoice_balances').select('supplier_invoice_id, supplier_ref, remaining').eq('supplier_id', p.supplier_id).eq('status', 'validated').gt('remaining', 0)
      targets = (si ?? []).map((s) => ({ value: `supplier_invoice:${s.supplier_invoice_id}`, label: `Pièce ${s.supplier_ref} — reste ${formatMoney(s.remaining)}` }))
    }
  }

  const party = p.clients
    ? <Link className="text-brand-600 hover:underline" href={`/finances/clients/${p.client_id}`}>{p.clients.display_name}</Link>
    : <Link className="text-brand-600 hover:underline" href={`/fournisseurs/${p.supplier_id}`}>{p.suppliers?.name}</Link>
  const canValidate = session.can('finance', 'validate')
  const items: Array<[ReactNode, ReactNode]> = [
    ['Tiers', party],
    ['Sens', p.direction === 'in' ? 'Entrée (encaissement)' : 'Sortie (décaissement)'],
    ['Type', p.kind === 'payment' ? 'Règlement' : p.kind === 'refund' ? 'Remboursement' : 'Contre-écriture'],
    ['Moyen', `${paymentMethodLabels[p.method]}${p.instrument_number ? ` n° ${p.instrument_number}` : ''}`],
    ['Banque tirée', p.drawer_bank ?? '—'],
    ['Date de réception', <DateText key="r" value={p.received_at} />],
    ['Échéance (valeur)', <DateText key="d" value={p.due_date} />],
    ['Date de valeur retenue', <DateText key="v" value={p.value_date} />],
    ['Compte de trésorerie', p.treasury_accounts?.name ?? '—'],
    ['Référence externe', p.external_ref ?? '—'],
    ['Bordereau de remise', p.deposit_slips ? <Link key="s" className="text-brand-600 hover:underline" href={`/finances/reglements/bordereaux/${p.deposit_slips.id}`}>{p.deposit_slips.reference}</Link> : '—'],
    ['Devise / taux', p.currency === 'TND' ? 'TND' : `${p.currency} × ${p.fx_rate} (${p.fx_rate_date ?? '—'})`],
  ]
  if (p.rejection_reason) items.push(['Motif de rejet', p.rejection_reason])
  if (p.notes) items.push(['Notes', p.notes])
  if (original) items.push(['Contre-écriture de', <Link key="o" className="text-brand-600 hover:underline" href={`/finances/reglements/${original.id}`}>{original.reference}</Link>])
  if (reversal) items.push(['Contrepassé par', <Link key="rv" className="text-brand-600 hover:underline" href={`/finances/reglements/${reversal.id}`}>{reversal.reference}</Link>])

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{p.reference} <StatusBadge status={p.status} labels={paymentStatusLabels} /></span>}
        description={`${formatMoney(p.amount, p.currency)} — ${p.clients?.display_name ?? p.suppliers?.name ?? ''}`}
        breadcrumbs={[{ href: '/finances/reglements', label: 'Règlements' }]}
        actions={
          <>
            <Link className={buttonClass('secondary')} href={`/finances/reglements/${id}/recu`}>{p.direction === 'in' ? 'Reçu imprimable' : 'Justificatif imprimable'}</Link>
            {p.client_id && p.status === 'validated' && p.direction === 'in' && session.can('finance', 'create') ? (
              <Link className={buttonClass('secondary')} href={`/finances/reglements/nouveau?client=${p.client_id}&direction=out&kind=refund`}>Rembourser</Link>
            ) : null}
          </>
        }
      />
      <Notice code={sp(sparams.notice)} refValue={sp(sparams.ref)} />

      <ol className="mb-5 flex flex-wrap gap-2 text-xs" aria-label="États du règlement">
        {STEPS.filter((s) => s !== 'deposited' || p.method === 'cheque' || p.method === 'bill').map((s) => {
          const reached = s === 'received' || (s === 'deposited' && !!p.deposit_slip_id) || (s === 'validated' && p.status === 'validated')
          const current = p.status === s
          return (
            <li key={s} className={`rounded-full px-3 py-1 ring-1 ${current ? 'bg-brand-500 text-white ring-brand-500' : reached ? 'bg-brand-50 text-brand-700 ring-brand-100' : 'bg-canvas text-muted ring-line'}`}>
              {paymentStatusLabels[s]}
            </li>
          )
        })}
        {p.status === 'rejected' ? <li className="rounded-full bg-danger-50 px-3 py-1 text-danger-700 ring-1 ring-danger-600/20">Rejeté</li> : null}
      </ol>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Détail" />
            <CardBody><DefinitionList items={items} /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Affectations" description="Ventilation explicite ; une affectation n’est jamais modifiée (contre-écriture si nécessaire)." />
            {(allocations ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucune affectation.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Cible</Th><Th>Note</Th><Th>Date</Th><Th className="text-right">Montant</Th></tr></thead>
                <tbody>
                  {(allocations ?? []).map((a) => (
                    <tr key={a.id}>
                      <Td>
                        {a.invoice_id ? <Link className="text-brand-600 hover:underline" href={`/finances/factures/${a.invoice_id}`}>Facture {a.invoices?.number}</Link> : null}
                        {a.supplier_invoice_id ? <Link className="text-brand-600 hover:underline" href={`/finances/fournisseurs/${a.supplier_invoice_id}`}>Pièce {a.supplier_invoices?.supplier_ref}</Link> : null}
                        {a.dossier_id ? <span className={a.invoice_id ? 'ml-2 text-xs text-muted' : ''}>Dossier <Link className="text-brand-600 hover:underline" href={`/dossiers/${a.dossier_id}`}>{a.dossiers?.reference}</Link></span> : null}
                      </Td>
                      <Td className="text-xs text-muted">{a.note ?? ''}</Td>
                      <Td><DateText value={a.created_at} /></Td>
                      <MoneyTd value={a.amount} currency={p.currency} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {targets.length && session.can('finance', 'create') ? (
              <CardBody className="border-t border-line">
                <ActionForm action={addAllocation} resetOnSuccess>
                  <input type="hidden" name="payment_id" value={id} />
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Affecter le solde non affecté à" htmlFor="target" className="md:col-span-2">
                      <Select id="target" name="target">{targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
                    </Field>
                    <Field label="Montant" htmlFor="alloc-amount"><Input id="alloc-amount" name="amount" inputMode="decimal" defaultValue={String(n(un?.unallocated))} /></Field>
                    <div className="flex items-end"><SubmitButton variant="secondary">Affecter</SubmitButton></div>
                  </div>
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Mouvements de trésorerie" description="Créés à la validation, au rejet ou à la contre-écriture ; jamais supprimés." />
            {(movements ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucun mouvement : le règlement n’est pas encore un encaissement effectif.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Date</Th><Th>Compte</Th><Th>Nature</Th><Th>Libellé</Th><Th className="text-right">Montant</Th></tr></thead>
                <tbody>
                  {(movements ?? []).map((m) => (
                    <tr key={m.id}>
                      <Td><DateText value={m.movement_date} /></Td>
                      <Td>{m.treasury_accounts?.name}</Td>
                      <Td className="text-xs">{m.kind}</Td>
                      <Td className="text-sm">{m.label}</Td>
                      <MoneyTd value={m.amount} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Montants" />
            <CardBody className="text-sm">
              <SummaryRow label="Montant">{formatMoney(p.amount, p.currency)}</SummaryRow>
              {p.currency !== 'TND' ? <SummaryRow label="Contre-valeur TND"><Amount value={p.amount_tnd} /></SummaryRow> : null}
              <SummaryRow label="Frais">{formatMoney(p.fees)}</SummaryRow>
              {n(p.withholding_amount) > 0 ? <SummaryRow label="Retenue à la source">{formatMoney(p.withholding_amount)}</SummaryRow> : null}
              <SummaryRow label="Affecté">{formatMoney(un?.allocated, p.currency)}</SummaryRow>
              <SummaryRow label="Non affecté" strong>{formatMoney(un?.unallocated, p.currency)}</SummaryRow>
            </CardBody>
          </Card>

          {canValidate && ['received', 'deposited', 'planned'].includes(p.status) ? (
            <Card>
              <CardHeader title="Valider l’encaissement" description="Constate l’encaissement effectif (avis de crédit, espèces comptées…)." />
              <CardBody>
                <ActionForm action={validatePayment}>
                  <input type="hidden" name="payment_id" value={id} />
                  <Field label="Compte de caisse / banque" htmlFor="v-account" required>
                    <Select id="v-account" name="treasury_account_id" defaultValue={p.treasury_account_id ?? ''}>
                      <option value="">— Choisir —</option>
                      {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date de valeur" htmlFor="value_date"><Input id="value_date" name="value_date" type="date" defaultValue={p.due_date && p.due_date <= todayTunis() ? p.due_date : todayTunis()} /></Field>
                  {p.due_date && p.due_date > todayTunis() ? <Alert tone="warning">Échéance future ({p.due_date}) : la valeur n’est pas encore disponible.</Alert> : null}
                  <SubmitButton confirm="Valider ce règlement ? Un mouvement de trésorerie et une écriture seront générés.">Valider</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {canValidate && !['rejected', 'cancelled'].includes(p.status) && p.kind !== 'reversal' && (p.method === 'cheque' || p.method === 'bill' || p.status !== 'validated') ? (
            <Card>
              <CardHeader title="Rejeter" description="Chèque ou traite impayé : états et justificatifs conservés (REC09)." />
              <CardBody>
                <ActionForm action={rejectPayment}>
                  <input type="hidden" name="payment_id" value={id} />
                  <Field label="Motif" htmlFor="rej-reason" required><Textarea id="rej-reason" name="reason" rows={2} required /></Field>
                  <Field label="Frais de rejet" htmlFor="rej-fees"><Input id="rej-fees" name="fees" inputMode="decimal" defaultValue="0" /></Field>
                  <SubmitButton variant="danger" confirm="Rejeter ce règlement ? La créance client sera rétablie.">Rejeter</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {canValidate && p.status === 'validated' && !reversal && p.kind !== 'reversal' ? (
            <Card>
              <CardHeader title="Contre-écriture" description="Correction tracée : le règlement initial est conservé." />
              <CardBody>
                <ActionForm action={reversePayment}>
                  <input type="hidden" name="payment_id" value={id} />
                  <Field label="Motif" htmlFor="rev-reason" required><Textarea id="rev-reason" name="reason" rows={2} required /></Field>
                  <SubmitButton variant="danger" confirm="Passer une contre-écriture de ce règlement ?">Contrepasser</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}
