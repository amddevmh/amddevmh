import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { activityLabels, invoiceKindLabels, invoiceStatusLabels, paymentStatusLabels, formatMoney, label } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, CardBody, CardHeader, DateText, DefinitionList, EmptyState, Field, Input, Select, StatusBadge, Table, Td, Th, Textarea, buttonClass } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { MoneyTd, SummaryRow, Amount } from '@/components/fin/common'
import { Notice } from '@/components/fin/notice'
import { requireStaff } from '@/lib/auth'
import { activeTaxRules } from '@/lib/fin/data'
import { n, todayTunis, sp, type SearchParams } from '@/lib/fin/format'
import { addInvoiceLine, cancelDraftInvoice, createCreditNote, deleteInvoiceLine, validateInvoice } from '../actions'

export const metadata = { title: 'Facture' }

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requireStaff('finance', 'read')
  const sparams = await searchParams
  const { id } = await params
  const supabase = await createClient()
  const { data: inv } = await supabase
    .from('invoices')
    .select('*, clients(id, display_name), dossiers(id, reference, title)')
    .eq('id', id)
    .maybeSingle()
  if (!inv) notFound()

  const [{ data: lines }, { data: balance }, { data: credits }, { data: allocations }, { data: original }, vat] = await Promise.all([
    supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('position'),
    supabase.from('invoice_balances').select('*').eq('invoice_id', id).maybeSingle(),
    supabase.from('invoices').select('id, number, status, total_ttc, reason, issue_date').eq('original_invoice_id', id).order('created_at'),
    supabase.from('payment_allocations').select('id, amount, created_at, payments(id, reference, status, method, received_at, direction)').eq('invoice_id', id),
    inv.original_invoice_id
      ? supabase.from('invoices').select('id, number, total_ttc').eq('id', inv.original_invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
    activeTaxRules(supabase, todayTunis(), 'vat'),
  ])
  const entries = session.can('accounting', 'read')
    ? (await supabase.from('journal_entries').select('id, journal_code, piece_ref, label, status, number, entry_date').eq('source_type', 'invoice').eq('source_id', id)).data ?? []
    : []

  const isDraft = inv.status === 'draft'
  const title = inv.number ?? `${invoiceKindLabels[inv.kind]} (brouillon)`
  const draftHt = (lines ?? []).reduce((a, l) => a + n(l.total_ht), 0)
  const draftTax = (lines ?? []).reduce((a, l) => a + n(l.tax_amount), 0)
  const creditable = inv.kind === 'invoice' && inv.status === 'validated' ? n(inv.total_ttc) - n(balance?.credited) : 0
  const unvalidatedTax = (lines ?? []).some((l) => l.tax_code && vat.find((t) => t.code === l.tax_code && !t.validated_by_accountant))

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{title} <StatusBadge status={inv.status} labels={invoiceStatusLabels} /></span>}
        description={`${invoiceKindLabels[inv.kind]} — ${inv.clients?.display_name ?? ''}`}
        breadcrumbs={[{ href: '/finances/factures', label: 'Factures et avoirs' }]}
        actions={
          <>
            {!isDraft ? <Link className={buttonClass('secondary')} href={`/finances/factures/${id}/imprimer`}>Imprimer / PDF</Link> : null}
            {inv.kind === 'invoice' && inv.status === 'validated' && n(balance?.open_amount) > 0 && session.can('finance', 'create') ? (
              <Link className={buttonClass('primary')} href={`/finances/reglements/nouveau?client=${inv.client_id}&invoice=${id}${inv.dossier_id ? `&dossier=${inv.dossier_id}` : ''}`}>
                Enregistrer un règlement
              </Link>
            ) : null}
          </>
        }
      />
      <Notice code={sp(sparams.notice)} refValue={sp(sparams.ref)} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Informations" />
            <CardBody>
              <DefinitionList
                items={[
                  ['Client payeur', inv.clients ? <Link className="text-brand-600 hover:underline" href={`/finances/clients/${inv.client_id}`}>{inv.clients.display_name}</Link> : '—'],
                  ['Dossier', inv.dossiers ? <Link className="text-brand-600 hover:underline" href={`/dossiers/${inv.dossier_id}`}>{inv.dossiers.reference} — {inv.dossiers.title}</Link> : '—'],
                  ['Date d’émission', <DateText key="i" value={inv.issue_date} />],
                  ['Échéance', <DateText key="d" value={inv.due_date} />],
                  ...(original ? [['Facture d’origine', <Link key="o" className="text-brand-600 hover:underline" href={`/finances/factures/${original.id}`}>{original.number}</Link>] as [string, ReactNode]] : []),
                  ...(inv.reason ? [['Motif', inv.reason] as [string, ReactNode]] : []),
                  ...(inv.notes ? [['Notes', inv.notes] as [string, ReactNode]] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Lignes" description={isDraft ? 'Brouillon : lignes modifiables jusqu’à la validation.' : 'Pièce validée : lignes figées. Correction uniquement par avoir.'} />
            {(lines ?? []).length === 0 ? (
              <EmptyState title="Aucune ligne" description="Ajoutez au moins une ligne chiffrée avant de valider." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Désignation</Th>
                    <Th>Activité</Th>
                    <Th className="text-right">Qté</Th>
                    <Th className="text-right">PU HT</Th>
                    <Th>Taxe</Th>
                    <Th className="text-right">Total HT</Th>
                    <Th className="text-right">Taxe</Th>
                    {isDraft && session.can('finance', 'update') ? <Th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {(lines ?? []).map((l) => (
                    <tr key={l.id}>
                      <Td>{l.description}</Td>
                      <Td className="text-xs text-muted">{l.activity ? label(activityLabels, l.activity) : '—'}</Td>
                      <Td className="text-right tabular">{Number(l.quantity)}</Td>
                      <MoneyTd value={l.unit_price} />
                      <Td className="text-xs">
                        {l.tax_code ?? 'Sans taxe'} ({(Number(l.tax_rate) * 100).toFixed(2)} %)
                        {l.tax_code && vat.find((t) => t.code === l.tax_code && !t.validated_by_accountant) ? <Badge tone="warning" className="ml-1">à valider</Badge> : null}
                      </Td>
                      <MoneyTd value={l.total_ht} />
                      <MoneyTd value={l.tax_amount} />
                      {isDraft && session.can('finance', 'update') ? (
                        <Td>
                          <ActionForm action={deleteInvoiceLine}>
                            <input type="hidden" name="line_id" value={l.id} />
                            <input type="hidden" name="invoice_id" value={id} />
                            <SubmitButton variant="ghost" size="sm" pendingLabel="…">Retirer</SubmitButton>
                          </ActionForm>
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {unvalidatedTax ? <p className="px-5 py-2 text-xs text-warning-600">Règle de taxe non encore validée par le comptable (FIN08).</p> : null}
            {isDraft && session.can('finance', 'update') ? (
              <CardBody className="border-t border-line">
                <ActionForm action={addInvoiceLine} resetOnSuccess>
                  <input type="hidden" name="invoice_id" value={id} />
                  <div className="grid gap-3 md:grid-cols-6">
                    <Field label="Désignation" htmlFor="description" className="md:col-span-2" required><Input id="description" name="description" required /></Field>
                    <Field label="Quantité" htmlFor="quantity"><Input id="quantity" name="quantity" defaultValue="1" inputMode="decimal" /></Field>
                    <Field label="PU HT (DT)" htmlFor="unit_price" required><Input id="unit_price" name="unit_price" inputMode="decimal" required /></Field>
                    <Field label="Taxe" htmlFor="tax_code">
                      <Select id="tax_code" name="tax_code" defaultValue={vat.find((t) => Number(t.rate) === 0)?.code ?? ''}>
                        <option value="">Sans taxe</option>
                        {vat.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                      </Select>
                    </Field>
                    <div className="flex items-end"><SubmitButton variant="secondary">Ajouter</SubmitButton></div>
                  </div>
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>

          {inv.kind === 'invoice' && !isDraft ? (
            <Card>
              <CardHeader title="Avoirs liés" />
              {(credits ?? []).length === 0 ? (
                <CardBody><p className="text-sm text-muted">Aucun avoir sur cette facture.</p></CardBody>
              ) : (
                <Table>
                  <thead><tr><Th>Avoir</Th><Th>Statut</Th><Th>Date</Th><Th>Motif</Th><Th className="text-right">Montant TTC</Th></tr></thead>
                  <tbody>
                    {(credits ?? []).map((c) => (
                      <tr key={c.id}>
                        <Td><Link className="text-brand-600 hover:underline" href={`/finances/factures/${c.id}`}>{c.number ?? 'Brouillon'}</Link></Td>
                        <Td><StatusBadge status={c.status} labels={invoiceStatusLabels} /></Td>
                        <Td><DateText value={c.issue_date} /></Td>
                        <Td className="text-sm">{c.reason}</Td>
                        <MoneyTd value={c.status === 'draft' ? null : c.total_ttc} />
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          ) : null}

          {inv.kind === 'invoice' && !isDraft ? (
            <Card>
              <CardHeader title="Règlements affectés" />
              {(allocations ?? []).length === 0 ? (
                <CardBody><p className="text-sm text-muted">Aucun règlement affecté.</p></CardBody>
              ) : (
                <Table>
                  <thead><tr><Th>Règlement</Th><Th>Statut</Th><Th>Reçu le</Th><Th className="text-right">Affecté</Th></tr></thead>
                  <tbody>
                    {(allocations ?? []).map((a) => (
                      <tr key={a.id}>
                        <Td><Link className="text-brand-600 hover:underline" href={`/finances/reglements/${a.payments?.id}`}>{a.payments?.reference}</Link></Td>
                        <Td><StatusBadge status={a.payments?.status} labels={paymentStatusLabels} /></Td>
                        <Td><DateText value={a.payments?.received_at} /></Td>
                        <MoneyTd value={a.amount} />
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <CardBody className="border-t border-line text-xs text-muted">Seuls les règlements validés réduisent le solde de la facture.</CardBody>
            </Card>
          ) : null}

          {entries.length ? (
            <Card>
              <CardHeader title="Écritures comptables générées" description="Générées en brouillard à la validation, à valider en comptabilité." />
              <Table>
                <thead><tr><Th>Journal</Th><Th>Pièce</Th><Th>Libellé</Th><Th>Statut</Th><Th>N°</Th></tr></thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <Td>{e.journal_code}</Td>
                      <Td className="font-mono text-xs">{e.piece_ref}</Td>
                      <Td>{e.label}</Td>
                      <Td><Badge tone={e.status === 'posted' ? 'success' : 'warning'}>{e.status === 'posted' ? 'Validée' : 'Brouillard'}</Badge></Td>
                      <Td className="font-mono text-xs">{e.number ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Montants" />
            <CardBody className="text-sm">
              {isDraft ? (
                <>
                  <SummaryRow label="Total HT (aperçu)"><Amount value={draftHt} /></SummaryRow>
                  <SummaryRow label="Taxes (aperçu)"><Amount value={draftTax} /></SummaryRow>
                  <SummaryRow label="Timbre">selon règle à la validation</SummaryRow>
                </>
              ) : (
                <>
                  <SummaryRow label="Total HT"><Amount value={inv.total_ht} /></SummaryRow>
                  <SummaryRow label="Taxes"><Amount value={inv.total_tax} /></SummaryRow>
                  <SummaryRow label="Timbre"><Amount value={inv.stamp_amount} /></SummaryRow>
                  <SummaryRow label="Total TTC" strong><Amount value={inv.total_ttc} /></SummaryRow>
                  {balance ? (
                    <>
                      <SummaryRow label="Avoirs validés"><Amount value={-n(balance.credited)} /></SummaryRow>
                      <SummaryRow label="Règlements validés"><Amount value={-n(balance.paid)} /></SummaryRow>
                      <SummaryRow label="Reste dû" strong><Amount value={balance.open_amount} /></SummaryRow>
                    </>
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>

          {isDraft && session.can('finance', 'validate') ? (
            <Card>
              <CardHeader title="Valider la pièce" description="Attribue le numéro définitif et fige la pièce." />
              <CardBody>
                <ActionForm action={validateInvoice}>
                  <input type="hidden" name="invoice_id" value={id} />
                  <Field label="Date d’émission" htmlFor="issue_date"><Input id="issue_date" name="issue_date" type="date" defaultValue={todayTunis()} /></Field>
                  <SubmitButton confirm="Valider cette pièce ? Elle sera numérotée et ne pourra plus être modifiée (correction par avoir uniquement).">Valider</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {isDraft && session.can('finance', 'update') ? (
            <Card>
              <CardHeader title="Annuler le brouillon" />
              <CardBody>
                <ActionForm action={cancelDraftInvoice}>
                  <input type="hidden" name="invoice_id" value={id} />
                  <Field label="Motif" htmlFor="reason" required><Input id="reason" name="reason" required /></Field>
                  <SubmitButton variant="danger" confirm="Annuler ce brouillon ?">Annuler le brouillon</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {inv.kind === 'invoice' && inv.status === 'validated' && session.can('finance', 'create') ? (
            <Card>
              <CardHeader title="Émettre un avoir" description={`Montant maximal : ${formatMoney(creditable)} (TTC restant après avoirs).`} />
              <CardBody>
                {creditable <= 0 ? (
                  <Alert tone="info">Cette facture est entièrement couverte par des avoirs.</Alert>
                ) : (
                  <ActionForm action={createCreditNote}>
                    <input type="hidden" name="original_id" value={id} />
                    <Field label="Motif" htmlFor="cn-reason" required hint="Obligatoire : imprimé sur l’avoir"><Textarea id="cn-reason" name="reason" rows={2} required /></Field>
                    <Field label="Montant TTC (DT)" htmlFor="cn-amount" required><Input id="cn-amount" name="amount" inputMode="decimal" required /></Field>
                    <Field label="Taxe" htmlFor="cn-tax">
                      <Select id="cn-tax" name="tax_code" defaultValue={(lines ?? [])[0]?.tax_code ?? ''}>
                        <option value="">Sans taxe</option>
                        {vat.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                      </Select>
                    </Field>
                    {session.can('finance', 'validate') ? (
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="validate_now" value="1" defaultChecked /> Valider immédiatement</label>
                    ) : null}
                    <SubmitButton confirm="Émettre cet avoir ? Une fois validé il est définitif.">Créer l’avoir</SubmitButton>
                  </ActionForm>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}
