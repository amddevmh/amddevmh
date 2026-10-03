import { createClient } from '@hi/db/server'
import { Card, CardBody } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { PaymentForm } from '@/components/fin/payment-form'
import { requireStaff } from '@/lib/auth'
import { listClients, listSuppliers, listTreasuryAccounts } from '@/lib/fin/data'
import { isUuid, n, sp, todayTunis, type SearchParams } from '@/lib/fin/format'
import { recordPayment } from '../actions'

export const metadata = { title: 'Nouveau règlement' }

export default async function NewPaymentPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('finance', 'create')
  const params = await searchParams
  const supabase = await createClient()

  const [clients, suppliers, accounts, { data: invoices }, { data: dossiers }, { data: supplierInvoices }] = await Promise.all([
    listClients(supabase),
    listSuppliers(supabase),
    listTreasuryAccounts(supabase),
    supabase.from('invoice_balances').select('invoice_id, number, client_id, dossier_id, due_date, open_amount').gt('open_amount', 0).order('due_date').limit(1000),
    supabase.from('dossier_financials').select('dossier_id, reference, client_id, balance, status').neq('status', 'archived').limit(1000),
    supabase.from('supplier_invoice_balances').select('supplier_invoice_id, supplier_id, supplier_ref, due_date, remaining, currency, status').eq('status', 'validated').gt('remaining', 0).limit(1000),
  ])
  const dossierRef = new Map((dossiers ?? []).map((d) => [d.dossier_id, d.reference]))

  // Préremplissage depuis les liens des autres écrans (dossier, facture, pièce fournisseur)
  const dossierId = isUuid(sp(params.dossier)) ? sp(params.dossier) : undefined
  const invoiceId = isUuid(sp(params.invoice)) ? sp(params.invoice) : undefined
  const supplierInvoiceId = isUuid(sp(params.supplier_invoice)) ? sp(params.supplier_invoice) : undefined
  let clientId = isUuid(sp(params.client)) ? sp(params.client) : undefined
  let supplierId = isUuid(sp(params.supplier)) ? sp(params.supplier) : undefined
  let amount: number | undefined
  if (dossierId && !clientId) clientId = (dossiers ?? []).find((d) => d.dossier_id === dossierId)?.client_id ?? undefined
  if (invoiceId) {
    const inv = (invoices ?? []).find((i) => i.invoice_id === invoiceId)
    clientId = clientId ?? inv?.client_id ?? undefined
    amount = inv ? n(inv.open_amount) : undefined
  } else if (supplierInvoiceId) {
    const si = (supplierInvoices ?? []).find((s) => s.supplier_invoice_id === supplierInvoiceId)
    supplierId = supplierId ?? si?.supplier_id ?? undefined
    amount = si ? n(si.remaining) : undefined
  } else if (dossierId) {
    const d = (dossiers ?? []).find((x) => x.dossier_id === dossierId)
    amount = d && n(d.balance) > 0 ? n(d.balance) : undefined
  }
  const direction = sp(params.direction) === 'out' || supplierId ? 'out' : 'in'
  const kind = sp(params.kind) === 'refund' ? 'refund' : 'payment'

  return (
    <>
      <PageHeader
        title="Nouveau règlement"
        description="Encaissement ou décaissement avec affectation explicite. Une nouvelle soumission du même formulaire ne crée jamais de doublon."
        breadcrumbs={[{ href: '/finances/reglements', label: 'Règlements' }]}
      />
      <Card>
        <CardBody>
          <PaymentForm
            action={recordPayment}
            idempotencyKey={crypto.randomUUID()}
            today={todayTunis()}
            clients={clients}
            suppliers={suppliers}
            accounts={accounts.filter((a) => a.active)}
            invoices={(invoices ?? []).map((i) => ({
              id: i.invoice_id!, number: i.number ?? '', client_id: i.client_id!, dossier_ref: i.dossier_id ? dossierRef.get(i.dossier_id) ?? null : null,
              due_date: i.due_date, open_amount: n(i.open_amount),
            }))}
            dossiers={(dossiers ?? []).map((d) => ({ id: d.dossier_id!, reference: d.reference ?? '', client_id: d.client_id!, balance: n(d.balance) }))}
            supplierInvoices={(supplierInvoices ?? []).map((s) => ({
              id: s.supplier_invoice_id!, supplier_id: s.supplier_id!, supplier_ref: s.supplier_ref ?? '', due_date: s.due_date, remaining: n(s.remaining), currency: s.currency ?? 'TND',
            }))}
            defaults={{
              direction, kind, party: supplierId ? 'supplier' : 'client', clientId, supplierId, invoiceId, dossierId, supplierInvoiceId, amount,
            }}
            canValidate={session.can('finance', 'validate')}
          />
        </CardBody>
      </Card>
    </>
  )
}
