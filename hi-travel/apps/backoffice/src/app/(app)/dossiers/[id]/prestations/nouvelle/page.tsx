import Link from 'next/link'
import { activityLabels, serviceTypeLabels, type Activity } from '@hi/core'
import { Card, CardBody, CardHeader, buttonClass } from '@hi/ui'
import { ServiceForm } from '@/components/ops/service-form'
import { requireStaff } from '@/lib/auth'
import { getHotelOptions, getSupplierOptions, sp, type SearchParams } from '@/lib/ops/data'
import { getDossier, getDossierServices } from '@/lib/ops/dossier'
import { moduleServiceTypes } from '@/lib/ops/labels'

export const metadata = { title: 'Nouvelle prestation' }

export default async function NewServicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requireStaff('dossiers', 'update')
  const { id } = await params
  const sparams = await searchParams
  const d = await getDossier(id)
  const activity = (sp(sparams, 'module') ?? d.activity) as Activity
  const types = moduleServiceTypes[activity] ?? ['other']
  const type = sp(sparams, 'type') ?? types[0]!
  const [suppliers, hotels, services] = await Promise.all([getSupplierOptions(), getHotelOptions(), getDossierServices(id)])

  return (
    <Card>
      <CardHeader
        title={`Nouvelle prestation — ${activityLabels[activity] ?? activity}`}
        description="La prestation est créée au statut « Demandée » ; option et confirmation se gèrent ensuite avec leurs justificatifs."
        actions={<Link href={`/dossiers/${id}/prestations`} className={buttonClass('ghost', 'sm')}>Annuler</Link>}
      />
      <CardBody className="space-y-4">
        {types.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <Link key={t} href={`/dossiers/${id}/prestations/nouvelle?module=${activity}&type=${t}`} className={buttonClass(t === type ? 'primary' : 'secondary', 'sm')}>{serviceTypeLabels[t]}</Link>
            ))}
          </div>
        ) : null}
        <ServiceForm
          key={`${activity}-${type}`}
          dossierId={id}
          activity={activity}
          serviceType={type}
          suppliers={suppliers}
          hotels={hotels}
          linkable={services.filter((s) => s.status !== 'cancelled').map((s) => ({ id: s.id, description: s.description, service_type: s.service_type }))}
          canMargins={session.can('margins')}
          defaults={{ start_date: d.start_date, end_date: d.end_date }}
        />
      </CardBody>
    </Card>
  )
}
