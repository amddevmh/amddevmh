import Link from 'next/link'
import { notFound } from 'next/navigation'
import { invoiceKindLabels, invoiceStatusLabels, paymentMethodLabels, paymentStatusLabels, formatDateFr } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Card, CardHeader, DateText, EmptyState, Stat, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { MoneyTd, PrintArea, PrintHeader } from '@/components/fin/common'
import { PrintButton } from '@/components/fin/print-button'
import { requireStaff } from '@/lib/auth'
import { getAgency } from '@/lib/fin/data'
import { n, todayTunis } from '@/lib/fin/format'
import { formatMoney } from '@hi/core'

export const metadata = { title: 'Relevé client' }

export default async function ClientStatementPage({ params }: { params: Promise<{ clientId: string }> }) {
  const session = await requireStaff('finance', 'read')
  const { clientId } = await params
  const supabase = await createClient()
  const { data: bal } = await supabase.from('client_balances').select('*').eq('client_id', clientId).maybeSingle()
  if (!bal) notFound()

  const [{ data: invoices }, { data: openInv }, { data: payments }, { data: dossiers }, agency] = await Promise.all([
    supabase.from('invoices').select('id, kind, number, status, issue_date, due_date, total_ttc, original_invoice_id, dossiers(reference)')
      .eq('client_id', clientId).neq('status', 'cancelled').order('issue_date', { ascending: true, nullsFirst: false }),
    supabase.from('invoice_balances').select('invoice_id, open_amount, paid, credited').eq('client_id', clientId),
    supabase.from('payments').select('id, reference, direction, kind, method, amount, amount_tnd, currency, status, received_at, due_date, instrument_number')
      .eq('client_id', clientId).order('received_at'),
    supabase.from('dossier_financials').select('dossier_id, reference, status, sale_net, paid, balance, overdue').eq('client_id', clientId),
    getAgency(supabase),
  ])
  const dossierIds = (dossiers ?? []).map((d) => d.dossier_id).filter((x): x is string => !!x)
  const { data: schedule } = dossierIds.length
    ? await supabase.from('payment_schedule_items').select('id, dossier_id, label, kind, amount, due_date').in('dossier_id', dossierIds).order('due_date')
    : { data: [] }
  const openById = new Map((openInv ?? []).map((o) => [o.invoice_id, o]))
  const refById = new Map((dossiers ?? []).map((d) => [d.dossier_id, d.reference]))
  const today = todayTunis()

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`Relevé client — ${bal.display_name}`}
          description="Factures, avoirs, règlements validés, échéances et solde (FIN01). Seuls les règlements validés réduisent le solde."
          breadcrumbs={[{ href: '/finances/factures', label: 'Factures et avoirs' }]}
          actions={
            <>
              <Link className={buttonClass('secondary')} href={`/crm/clients/${clientId}`}>Fiche client</Link>
              {session.can('finance', 'create') ? <Link className={buttonClass('secondary')} href={`/finances/reglements/nouveau?client=${clientId}`}>Enregistrer un règlement</Link> : null}
              <PrintButton label="Imprimer le relevé" />
            </>
          }
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Facturé" value={formatMoney(bal.invoiced)} href={`/finances/factures?client=${clientId}&kind=invoice&status=validated`} />
          <Stat label="Avoirs" value={formatMoney(bal.credited)} href={`/finances/factures?client=${clientId}&kind=credit_note&status=validated`} />
          <Stat label="Règlements validés (nets)" value={formatMoney(bal.paid)} href={`/finances/reglements?client=${clientId}&status=validated`} />
          <Stat label="Solde client" value={formatMoney(bal.balance)} tone={n(bal.balance) > 0 ? 'warning' : 'success'} hint="Facturé − avoirs − règlements validés" />
        </div>
      </div>

      <PrintArea>
        <PrintHeader agency={agency} title="Relevé de compte" reference={bal.display_name ?? ''} subtitle={<p>Arrêté au {formatDateFr(today)}</p>} />
        <div className="space-y-6">
          <Card>
            <CardHeader title="Factures et avoirs" />
            {(invoices ?? []).length === 0 ? <EmptyState title="Aucune pièce" /> : (
              <Table>
                <thead><tr><Th>Pièce</Th><Th>Type</Th><Th>Statut</Th><Th>Dossier</Th><Th>Date</Th><Th>Échéance</Th><Th className="text-right">Montant</Th><Th className="text-right">Reste dû</Th></tr></thead>
                <tbody>
                  {(invoices ?? []).map((i) => {
                    const o = openById.get(i.id)
                    return (
                      <tr key={i.id}>
                        <Td><Link className="text-brand-600 hover:underline" href={`/finances/factures/${i.id}`}>{i.number ?? 'Brouillon'}</Link></Td>
                        <Td>{invoiceKindLabels[i.kind]}</Td>
                        <Td><StatusBadge status={i.status} labels={invoiceStatusLabels} /></Td>
                        <Td>{i.dossiers?.reference ?? '—'}</Td>
                        <Td><DateText value={i.issue_date} /></Td>
                        <Td><DateText value={i.due_date} /></Td>
                        <MoneyTd value={i.status === 'draft' ? null : i.kind === 'credit_note' ? -n(i.total_ttc) : i.total_ttc} />
                        <MoneyTd value={o ? o.open_amount : null} className={o && n(o.open_amount) > 0 && i.due_date && i.due_date < today ? 'text-danger-700' : undefined} />
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Règlements" description="Les règlements reçus non validés (chèques à encaisser…) ne réduisent pas le solde." />
            {(payments ?? []).length === 0 ? <EmptyState title="Aucun règlement" /> : (
              <Table>
                <thead><tr><Th>Référence</Th><Th>Date</Th><Th>Moyen</Th><Th>Sens</Th><Th>Statut</Th><Th>Échéance valeur</Th><Th className="text-right">Montant</Th></tr></thead>
                <tbody>
                  {(payments ?? []).map((p) => (
                    <tr key={p.id}>
                      <Td><Link className="text-brand-600 hover:underline" href={`/finances/reglements/${p.id}`}>{p.reference}</Link></Td>
                      <Td><DateText value={p.received_at} /></Td>
                      <Td>{paymentMethodLabels[p.method]}{p.instrument_number ? ` n° ${p.instrument_number}` : ''}</Td>
                      <Td>{p.direction === 'in' ? 'Encaissement' : p.kind === 'reversal' ? 'Contre-écriture' : 'Remboursement'}</Td>
                      <Td><StatusBadge status={p.status} labels={paymentStatusLabels} /></Td>
                      <Td><DateText value={p.due_date} /></Td>
                      <MoneyTd value={p.direction === 'in' ? p.amount_tnd : -n(p.amount_tnd)} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Dossiers et échéancier" />
            {(dossiers ?? []).length === 0 ? <EmptyState title="Aucun dossier" /> : (
              <Table>
                <thead><tr><Th>Dossier</Th><Th className="text-right">Vente nette</Th><Th className="text-right">Encaissé</Th><Th className="text-right">Solde</Th><Th className="text-right">En retard</Th></tr></thead>
                <tbody>
                  {(dossiers ?? []).map((d) => (
                    <tr key={d.dossier_id}>
                      <Td><Link className="text-brand-600 hover:underline" href={`/dossiers/${d.dossier_id}`}>{d.reference}</Link></Td>
                      <MoneyTd value={d.sale_net} />
                      <MoneyTd value={d.paid} />
                      <MoneyTd value={d.balance} strong />
                      <MoneyTd value={d.overdue} className={n(d.overdue) > 0 ? 'text-danger-700' : undefined} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {(schedule ?? []).length ? (
              <Table className="border-t border-line">
                <thead><tr><Th>Échéance</Th><Th>Dossier</Th><Th>Libellé</Th><Th className="text-right">Montant</Th></tr></thead>
                <tbody>
                  {(schedule ?? []).map((s) => (
                    <tr key={s.id}>
                      <Td><DateText value={s.due_date} className={s.due_date && s.due_date < today ? 'text-danger-700' : undefined} /></Td>
                      <Td>{refById.get(s.dossier_id)}</Td>
                      <Td>{s.label}</Td>
                      <MoneyTd value={s.amount} />
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </Card>
          <div className="ml-auto w-80 rounded-card border border-line p-4 text-sm">
            <div className="flex justify-between"><span>Total facturé</span><span className="tabular">{formatMoney(bal.invoiced)}</span></div>
            <div className="flex justify-between"><span>Avoirs</span><span className="tabular">{formatMoney(-n(bal.credited) || 0)}</span></div>
            <div className="flex justify-between"><span>Règlements validés nets</span><span className="tabular">{formatMoney(-n(bal.paid) || 0)}</span></div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold text-brand-900"><span>Solde dû</span><span className="tabular">{formatMoney(bal.balance)}</span></div>
          </div>
        </div>
      </PrintArea>
    </>
  )
}
