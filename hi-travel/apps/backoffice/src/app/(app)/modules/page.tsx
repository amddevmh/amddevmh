import Link from 'next/link'
import { ACTIVITIES, activityLabels } from '@hi/core'
import { Card, CardBody, CardHeader, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { ServicesFilter } from '@/components/ops/services-filter'
import { ServicesList } from '@/components/ops/services-list'
import { requireStaff } from '@/lib/auth'
import { getSupplierOptions, sp, type SearchParams } from '@/lib/ops/data'
import { fetchServices } from '@/lib/ops/services-query'

export const metadata = { title: 'Modules métiers' }

export default async function ModulesIndex({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff('dossiers')
  const params = await searchParams
  const values = { statut: sp(params, 'statut'), fournisseur: sp(params, 'fournisseur'), q: sp(params, 'q'), du: sp(params, 'du'), au: sp(params, 'au'), activite: sp(params, 'activite'), revue: sp(params, 'revue'), expire: sp(params, 'expire') }
  const [suppliers, { rows, error }] = await Promise.all([
    getSupplierOptions(),
    fetchServices({ activity: values.activite, statuses: values.statut?.split(','), review: values.revue === '1', expiring48h: values.expire === '48h', supplierId: values.fournisseur, q: values.q, from: values.du, to: values.au }),
  ])
  return (
    <>
      <PageHeader title="Modules métiers" description="Toutes les prestations des dossiers en cours, chacune suivie dans son module d’origine." />
      <div className="mb-4 flex flex-wrap gap-2">
        {ACTIVITIES.map((a) => <Link key={a} href={`/modules/${a}`} className={buttonClass('secondary', 'sm')}>{activityLabels[a]}</Link>)}
      </div>
      <ServicesFilter action="/modules" values={values} suppliers={suppliers} showModule />
      <Card>
        <CardHeader title={`${rows.length} prestation(s)`} description={error ? `Erreur : ${error}` : undefined} />
        <CardBody><ServicesList rows={rows} showModule /></CardBody>
      </Card>
    </>
  )
}
