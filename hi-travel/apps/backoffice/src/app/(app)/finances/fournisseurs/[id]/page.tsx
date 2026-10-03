import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatMoney, paymentStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, CardBody, CardHeader, DateText, DefinitionList, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { AllocationEditor } from '@/components/fin/allocation-editor'
import { Amount, MoneyTd, SummaryRow } from '@/components/fin/common'
import { Notice } from '@/components/fin/notice'
import { requireStaff } from '@/lib/auth'
import { n, sp, type SearchParams } from '@/lib/fin/format'
import { allocateSupplierInvoice, cancelSupplierInvoice, validateSupplierInvoice } from '../actions'

export const metadata = { title: 'Pièce fournisseur' }

const STATUS = { draft: 'Brouillon', validated: 'Validée', cancelled: 'Annulée' }
const METHOD = { percent: 'Pourcentage', nights: 'Nuitées', pax: 'Passagers', line: 'Ligne', manual: 'Clé manuelle' } as Record<string, string>

export default async function SupplierInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requireStaff('finance', 'read')
  const sparams = await searchParams
  const { id } = await params
  const supabase = await createClient()
  const { data: si } = await supabase.from('supplier_invoices').select('*, suppliers(id, name)').eq('id', id).maybeSingle()
  if (!si) notFound()

  const [{ data: bal }, { data: allocs }, { data: pays }, { data: dossiers }, { data: departures }, { data: services }] = await Promise.all([
    supabase.from('supplier_invoice_balances').select('*').eq('supplier_invoice_id', id).maybeSingle(),
    supabase.from('cost_allocations').select('id, amount, amount_tnd, method, basis, cost_kind, status, created_at, dossier_id, departure_id, service_id, dossiers(reference), departures(code), services(description)').eq('supplier_invoice_id', id).order('created_at'),
    supabase.from('payment_allocations').select('id, amount, payments(id, reference, status, received_at)').eq('supplier_invoice_id', id),
    supabase.from('dossiers').select('id, reference, title, adults, children, infants').neq('status', 'archived').order('created_at', { ascending: false }).limit(300),
    supabase.from('departures').select('id, code, start_date, seats_confirmed').order('start_date', { ascending: false }).limit(300),
    supabase.from('services').select('id, description, nights, quantity, dossiers(reference)').eq('supplier_id', si.supplier_id).neq('status', 'cancelled').limit(300),
  ])
  const entries = session.can('accounting', 'read')
    ? (await supabase.from('journal_entries').select('id, journal_code, piece_ref, label, status, number').eq('source_type', 'supplier_invoice').eq('source_id', id)).data ?? []
    : []
  const cur = si.currency
  const items: Array<[ReactNode, ReactNode]> = [
    ['Fournisseur', <Link key="s" className="text-brand-600 hover:underline" href={`/fournisseurs/${si.supplier_id}`}>{si.suppliers?.name}</Link>],
    ['Date de la pièce', <DateText key="d" value={si.issue_date} />],
    ['Période de prestation', si.service_period_start ? <span key="p"><DateText value={si.service_period_start} /> → <DateText value={si.service_period_end} /></span> : '—'],
    ['Échéance', <DateText key="e" value={si.due_date} />],
    ['Devise et taux', cur === 'TND' ? 'TND' : `1 ${cur} = ${si.fx_rate} TND — ${si.fx_rate_source ?? '?'} du ${si.fx_rate_date ?? '?'}`],
    ['Contre-valeur TND', formatMoney(si.total_tnd)],
    ['Retenue à la source', si.withholding_rule ? `${si.withholding_rule} — base ${formatMoney(si.withholding_base, cur)} — ${formatMoney(si.withholding_amount, cur)}` : '—'],
  ]
  if (si.duplicate_justification) items.push(['Exception doublon justifiée', si.duplicate_justification])
  if (si.notes) items.push(['Notes', si.notes])

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Pièce {si.supplier_ref} <StatusBadge status={si.status} labels={STATUS} /></span>}
        description={`${si.suppliers?.name ?? ''} — ${formatMoney(si.total_amount, cur)}`}
        breadcrumbs={[{ href: '/finances/fournisseurs', label: 'Pièces fournisseurs' }]}
        actions={si.status === 'validated' && n(bal?.remaining) > 0 && session.can('finance', 'create') ? (
          <Link className={buttonClass('primary')} href={`/finances/reglements/nouveau?supplier=${si.supplier_id}&supplier_invoice=${id}`}>Régler le fournisseur</Link>
        ) : null}
      />
      <Notice code={sp(sparams.notice)} refValue={sp(sparams.ref)} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card><CardHeader title="Informations" /><CardBody><DefinitionList items={items} /></CardBody></Card>

          <Card>
            <CardHeader title="Ventilation des coûts" description="Un achat partagé n’est jamais compté plusieurs fois : la somme des ventilations ne peut dépasser la pièce (REC12)." />
            {(allocs ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucune ventilation.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Cible</Th><Th>Méthode</Th><Th>Clé</Th><Th>Nature</Th><Th className="text-right">Montant</Th><Th className="text-right">TND</Th></tr></thead>
                <tbody>
                  {(allocs ?? []).map((a) => {
                    const basis = (a.basis ?? {}) as { weight?: number; weight_sum?: number }
                    return (
                      <tr key={a.id}>
                        <Td>
                          {a.departure_id ? <span>Départ {a.departures?.code}</span> : null}
                          {a.service_id ? <span>Prestation {a.services?.description}</span> : null}
                          {a.dossier_id ? <Link className="ml-1 text-brand-600 hover:underline" href={`/dossiers/${a.dossier_id}`}>{a.dossiers?.reference}</Link> : null}
                        </Td>
                        <Td>{METHOD[a.method] ?? a.method}</Td>
                        <Td className="text-xs text-muted">{basis.weight != null ? `${basis.weight} / ${basis.weight_sum}` : '—'}</Td>
                        <Td><Badge tone={a.cost_kind === 'common' ? 'info' : 'neutral'}>{a.cost_kind === 'common' ? 'Commun' : 'Individuel'}</Badge></Td>
                        <MoneyTd value={a.amount} currency={cur} />
                        <MoneyTd value={a.amount_tnd} />
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
            {si.status !== 'cancelled' && n(bal?.unallocated) > 0 && session.can('finance', 'create') ? (
              <CardBody className="border-t border-line">
                <AllocationEditor
                  action={allocateSupplierInvoice}
                  supplierInvoiceId={id}
                  unallocated={n(bal?.unallocated)}
                  currency={cur}
                  dossiers={(dossiers ?? []).map((d) => ({ id: d.id, label: `${d.reference} — ${d.title}`, pax: d.adults + d.children + d.infants }))}
                  departures={(departures ?? []).map((d) => ({ id: d.id, label: `${d.code} (${d.start_date})`, pax: d.seats_confirmed }))}
                  services={(services ?? []).map((s) => ({ id: s.id, label: `${s.dossiers?.reference ?? ''} — ${s.description}`, nights: s.nights, quantity: Number(s.quantity) }))}
                />
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Règlements" />
            {(pays ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucun règlement affecté.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Règlement</Th><Th>Statut</Th><Th>Date</Th><Th className="text-right">Affecté</Th></tr></thead>
                <tbody>
                  {(pays ?? []).map((p) => (
                    <tr key={p.id}>
                      <Td><Link className="text-brand-600 hover:underline" href={`/finances/reglements/${p.payments?.id}`}>{p.payments?.reference}</Link></Td>
                      <Td><StatusBadge status={p.payments?.status} labels={paymentStatusLabels} /></Td>
                      <Td><DateText value={p.payments?.received_at} /></Td>
                      <MoneyTd value={p.amount} currency={cur} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {entries.length ? (
            <Card>
              <CardHeader title="Écritures comptables" />
              <Table>
                <thead><tr><Th>Journal</Th><Th>Pièce</Th><Th>Libellé</Th><Th>Statut</Th></tr></thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}><Td>{e.journal_code}</Td><Td className="font-mono text-xs">{e.piece_ref}</Td><Td>{e.label}</Td><Td><Badge tone={e.status === 'posted' ? 'success' : 'warning'}>{e.status === 'posted' ? `Validée ${e.number}` : 'Brouillard'}</Badge></Td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Situation" />
            <CardBody className="text-sm">
              <SummaryRow label="Montant de la pièce"><Amount value={si.total_amount} currency={cur} /></SummaryRow>
              <SummaryRow label="Retenue à la source"><Amount value={-n(si.withholding_amount)} currency={cur} /></SummaryRow>
              <SummaryRow label="Payé (validé)"><Amount value={-n(bal?.paid)} currency={cur} /></SummaryRow>
              <SummaryRow label="Restant dû" strong><Amount value={bal?.remaining} currency={cur} /></SummaryRow>
              <div className="my-2 border-t border-line" />
              <SummaryRow label="Ventilé"><Amount value={bal?.allocated} currency={cur} /></SummaryRow>
              <SummaryRow label="Non ventilé" strong><Amount value={bal?.unallocated} currency={cur} /></SummaryRow>
            </CardBody>
          </Card>
          {si.status === 'draft' && session.can('finance', 'validate') ? (
            <Card>
              <CardHeader title="Valider la pièce" description="Génère l’écriture d’achat en brouillard." />
              <CardBody>
                <ActionForm action={validateSupplierInvoice}>
                  <input type="hidden" name="id" value={id} />
                  <SubmitButton confirm="Valider cette pièce fournisseur ?">Valider</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {si.status === 'draft' && session.can('finance', 'update') ? (
            <Card>
              <CardBody>
                <ActionForm action={cancelSupplierInvoice}>
                  <input type="hidden" name="id" value={id} />
                  <SubmitButton variant="ghost" confirm="Annuler cette pièce en brouillon ?">Annuler la pièce</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {si.status === 'cancelled' ? <Alert tone="info">Pièce annulée : conservée pour l’historique.</Alert> : null}
        </div>
      </div>
    </>
  )
}
