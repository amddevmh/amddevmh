import { createClient } from '@hi/db/server'
import { Card, CardBody } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { SupplierInvoiceForm } from '@/components/fin/supplier-invoice-form'
import { requireStaff } from '@/lib/auth'
import { activeTaxRules, listSuppliers } from '@/lib/fin/data'
import { isUuid, sp, todayTunis, type SearchParams } from '@/lib/fin/format'
import { createSupplierInvoice, suggestFxRate } from '../actions'

export const metadata = { title: 'Nouvelle pièce fournisseur' }

export default async function NewSupplierInvoicePage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff('finance', 'create')
  const params = await searchParams
  const supabase = await createClient()
  const today = todayTunis()
  const [suppliers, wht] = await Promise.all([listSuppliers(supabase), activeTaxRules(supabase, today, 'withholding')])
  const supplierId = sp(params.supplier)
  return (
    <>
      <PageHeader
        title="Nouvelle pièce fournisseur"
        description="Facture d’achat avec devise, taux daté et source, retenue à la source. Le doublon de référence est signalé ; une exception justifiée reste possible (FIN03)."
        breadcrumbs={[{ href: '/finances/fournisseurs', label: 'Pièces fournisseurs' }]}
      />
      <Card>
        <CardBody>
          <SupplierInvoiceForm
            action={createSupplierInvoice}
            suggest={suggestFxRate}
            suppliers={suppliers}
            withholdingRules={wht.map((r) => ({ code: r.code, label: r.label, rate: Number(r.rate ?? 0), validated: r.validated_by_accountant }))}
            defaultSupplierId={isUuid(supplierId) ? supplierId : undefined}
            today={today}
          />
        </CardBody>
      </Card>
    </>
  )
}
