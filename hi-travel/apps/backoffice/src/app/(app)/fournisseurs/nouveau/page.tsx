import { Card, CardBody } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { SupplierFields } from '@/components/ops/supplier-fields'
import { requireStaff } from '@/lib/auth'
import { saveSupplier } from '@/lib/ops/actions/suppliers'

export const metadata = { title: 'Nouveau fournisseur' }

export default async function NewSupplierPage() {
  await requireStaff('suppliers', 'create')
  return (
    <>
      <PageHeader title="Nouveau fournisseur" breadcrumbs={[{ href: '/fournisseurs', label: 'Fournisseurs' }]} />
      <Card><CardBody>
        <OpsForm action={saveSupplier}>
          <SupplierFields />
          <OpsSubmit>Créer le fournisseur</OpsSubmit>
        </OpsForm>
      </CardBody></Card>
    </>
  )
}
