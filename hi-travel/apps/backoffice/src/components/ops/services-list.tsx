import Link from 'next/link'
import { activityLabels, formatDateFr, formatDateTimeFr, label, serviceStatusLabels, serviceTypeLabels } from '@hi/core'
import { Badge, EmptyState, Money, StatusBadge, Table, Td, Th } from '@hi/ui'
import { formatInZone } from '@/lib/ops/format'
import { TimeLeft } from './ui'

export interface ServiceListRow {
  id: string
  dossier_id: string
  activity: string
  service_type: string
  description: string
  status: string
  start_date: string | null
  end_date: string | null
  start_at: string | null
  local_timezone: string
  option_deadline: string | null
  confirmation_ref: string | null
  needs_review: boolean
  review_reason: string | null
  sale_price: number
  nights: number | null
  suppliers?: { name: string } | null
  dossiers?: { reference: string; start_date: string | null; end_date: string | null; status: string; clients?: { display_name: string | null } | null } | null
}

/** Liste filtrable des prestations (suivi des statuts par module, lien vers le dossier). */
export function ServicesList({ rows, showModule = false, hotelView = false }: { rows: ServiceListRow[]; showModule?: boolean; hotelView?: boolean }) {
  if (!rows.length) return <EmptyState title="Aucune prestation" description="Aucune prestation ne correspond à ces critères." />
  return (
    <Table className="-mx-5">
      <thead>
        <tr>
          <Th>Prestation</Th>{showModule ? <Th>Module</Th> : null}<Th>Dossier / client</Th><Th>Fournisseur</Th><Th>Dates</Th>
          {hotelView ? <Th className="text-right">Nuitées / voyage</Th> : null}
          <Th>Statut</Th><Th className="text-right">Vente</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const d = s.dossiers
          const tripNights = d?.start_date && d?.end_date ? Math.round((Date.parse(d.end_date) - Date.parse(d.start_date)) / 86400000) : null
          const outside = hotelView && d?.start_date && d?.end_date && s.start_date && s.end_date && (s.start_date < d.start_date || s.end_date > d.end_date)
          return (
            <tr key={s.id} className={s.needs_review ? 'bg-danger-50/40' : undefined}>
              <Td>
                <Link href={`/dossiers/${s.dossier_id}/prestations/${s.id}`} className="font-medium text-brand-600 hover:underline">{s.description}</Link>
                <p className="text-xs text-muted">{label(serviceTypeLabels, s.service_type)}</p>
                {s.needs_review ? <p className="text-xs text-danger-700">À revoir : {s.review_reason}</p> : null}
              </Td>
              {showModule ? <Td>{label(activityLabels, s.activity)}</Td> : null}
              <Td>
                <Link href={`/dossiers/${s.dossier_id}`} className="text-brand-600 hover:underline">{d?.reference}</Link>
                <p className="text-xs text-muted">{d?.clients?.display_name}</p>
              </Td>
              <Td>{s.suppliers?.name ?? <span className="text-xs text-warning-600">À préciser</span>}</Td>
              <Td className="whitespace-nowrap text-sm">
                {s.start_at ? formatInZone(s.start_at, s.local_timezone) : s.start_date ? `${formatDateFr(s.start_date)}${s.end_date && s.end_date !== s.start_date ? ` → ${formatDateFr(s.end_date)}` : ''}` : <span className="text-muted">À préciser</span>}
              </Td>
              {hotelView ? (
                <Td className="text-right">
                  <span className="font-medium">{s.nights ?? '—'}</span> <span className="text-xs text-muted">/ {tripNights ?? '—'}</span>
                  {outside ? <p><Badge tone="warning">Hors dates du voyage</Badge></p> : null}
                  {s.nights != null && tripNights != null && s.nights > tripNights ? <p><Badge tone="danger">Nuitées &gt; voyage</Badge></p> : null}
                </Td>
              ) : null}
              <Td>
                <StatusBadge status={s.status} labels={serviceStatusLabels} />
                {s.status === 'option' && s.option_deadline ? <p className="text-xs">jusqu’au {formatDateTimeFr(s.option_deadline)}<br /><TimeLeft dueAt={s.option_deadline} /></p> : null}
                {s.status === 'confirmed' && s.confirmation_ref ? <p className="text-xs text-muted">réf. {s.confirmation_ref}</p> : null}
              </Td>
              <Td className="text-right"><Money value={s.sale_price} /></Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}
