import { Alert, Card, CardBody } from '@hi/ui'
import { createClient } from '@hi/db/server'
import { PageHeader } from '@/components/page'
import { InvoiceForm, type DraftLine } from '@/components/fin/invoice-form'
import { requireStaff } from '@/lib/auth'
import { activeTaxRules, listClients, listDossiers } from '@/lib/fin/data'
import { isUuid, sp, todayTunis, type SearchParams } from '@/lib/fin/format'
import { createInvoice } from '../actions'

export const metadata = { title: 'Nouvelle facture' }

export default async function NewInvoicePage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff('finance', 'create')
  const params = await searchParams
  const dossierId = sp(params.dossier)
  const kind = sp(params.kind) === 'proforma' ? 'proforma' : 'invoice'
  const supabase = await createClient()

  const [clients, dossiers, vat] = await Promise.all([listClients(supabase), listDossiers(supabase), activeTaxRules(supabase, todayTunis(), 'vat')])
  const taxes = vat.map((t) => ({ code: t.code, label: t.label, rate: Number(t.rate ?? 0), validated: t.validated_by_accountant }))
  const defaultTax = taxes.find((t) => t.rate === 0)?.code ?? taxes[0]?.code ?? ''

  let dossier: { id: string; reference: string; client_id: string } | null = null
  let lines: DraftLine[] = []
  let alreadyInvoiced = 0
  if (isUuid(dossierId)) {
    const { data } = await supabase.from('dossiers').select('id, reference, client_id').eq('id', dossierId).maybeSingle()
    dossier = data
    if (dossier) {
      // Prix de vente client uniquement (aucun coût fournisseur repris)
      const { data: services } = await supabase
        .from('services')
        .select('id, description, activity, quantity, sale_price, status')
        .eq('dossier_id', dossier.id)
        .neq('status', 'cancelled')
        .order('start_date', { ascending: true, nullsFirst: false })
      lines = (services ?? [])
        .filter((s) => Number(s.sale_price) > 0)
        .map((s) => ({
          description: s.description,
          quantity: '1',
          unit_price: String(Number(s.sale_price)),
          tax_code: defaultTax,
          activity: s.activity,
          service_id: s.id,
        }))
      const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true })
        .eq('dossier_id', dossier.id).eq('kind', 'invoice').neq('status', 'cancelled')
      alreadyInvoiced = count ?? 0
    }
  }

  return (
    <>
      <PageHeader
        title={kind === 'proforma' ? 'Nouvelle pro forma' : 'Nouvelle facture'}
        description="Brouillon modifiable jusqu’à la validation : la pièce reçoit alors son numéro et devient figée."
        breadcrumbs={[{ href: '/finances/factures', label: 'Factures et avoirs' }]}
      />
      {dossier ? (
        <Alert tone="info" className="mb-4">
          Lignes préremplies depuis les prestations du dossier {dossier.reference} (prix de vente client uniquement).
          {alreadyInvoiced > 0 ? ` Attention : ${alreadyInvoiced} facture(s) existe(nt) déjà pour ce dossier.` : ''}
        </Alert>
      ) : null}
      <Card>
        <CardBody>
          <InvoiceForm
            action={createInvoice}
            clients={clients}
            dossiers={dossiers}
            taxes={taxes}
            defaultClientId={dossier?.client_id ?? sp(params.client)}
            defaultDossierId={dossier?.id}
            defaultKind={kind}
            initialLines={lines}
          />
        </CardBody>
      </Card>
    </>
  )
}
