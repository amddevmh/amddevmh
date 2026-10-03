import Link from 'next/link'
import { activityLabels, dossierStatusLabels, formatDateFr, label } from '@hi/core'
import { Badge, StatusBadge } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { RouteTabs } from '@/components/ops/route-tabs'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/ops/data'
import { getDossier } from '@/lib/ops/dossier'
import { financialStatusLabels } from '@/lib/ops/labels'

export default async function DossierLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await requireStaff('dossiers')
  const { id } = await params
  const d = await getDossier(id)
  const supabase = await db()
  const [services, review, tasks, docs, deadlines, incidents, participants] = await Promise.all([
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('dossier_id', id).neq('status', 'cancelled'),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('dossier_id', id).eq('needs_review', true),
    session.can('tasks') ? supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('dossier_id', id).not('status', 'in', '(done,cancelled)') : Promise.resolve({ count: null }),
    session.can('documents') ? supabase.from('documents').select('id', { count: 'exact', head: true }).eq('dossier_id', id) : Promise.resolve({ count: null }),
    session.can('tasks') ? supabase.from('external_deadlines').select('id', { count: 'exact', head: true }).eq('dossier_id', id).eq('status', 'open') : Promise.resolve({ count: null }),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('dossier_id', id).in('status', ['open', 'in_progress']),
    d.activity === 'mice' ? supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('dossier_id', id).neq('attendance', 'cancelled') : Promise.resolve({ count: null }),
  ])
  const base = `/dossiers/${id}`
  const client = d.clients as { id: string; display_name: string | null } | null
  const tabs = [
    { href: base, label: 'Synthèse' },
    { href: `${base}/prestations`, label: 'Prestations', count: services.count ?? undefined },
    { href: `${base}/voyageurs`, label: 'Voyageurs' },
    ...(d.activity === 'mice' ? [{ href: `${base}/participants`, label: 'Participants', count: participants.count ?? undefined }] : []),
    { href: `${base}/paiements`, label: 'Échéancier et paiements' },
    ...(session.can('documents') ? [{ href: `${base}/documents`, label: 'Documents', count: docs.count ?? undefined }] : []),
    ...(session.can('tasks') ? [{ href: `${base}/taches`, label: 'Tâches', count: tasks.count ?? undefined }] : []),
    { href: `${base}/controle`, label: 'Contrôle avant départ' },
    ...(session.can('tasks') ? [{ href: `${base}/echeances`, label: 'Échéances fournisseurs', count: deadlines.count ?? undefined }] : []),
    { href: `${base}/incidents`, label: 'Incidents et modifications', count: incidents.count || undefined },
    ...(session.can('reports') ? [{ href: `${base}/historique`, label: 'Historique' }] : []),
  ]

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: '/dossiers', label: 'Dossiers' }]}
        title={<span className="flex flex-wrap items-center gap-3">{d.reference}<StatusBadge status={d.status} labels={dossierStatusLabels} />{d.is_omra ? <Badge tone="accent">Omra</Badge> : null}</span>}
        description={
          <>
            {d.title} — {client ? <Link href={`/crm/clients/${client.id}`} className="text-brand-600 hover:underline">{client.display_name}</Link> : null} — {label(activityLabels, d.activity)}
            {d.start_date ? ` — ${formatDateFr(d.start_date)} → ${formatDateFr(d.end_date)}` : ''}
          </>
        }
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={d.financial_status === 'closed' ? 'success' : d.financial_status === 'open' ? 'neutral' : 'warning'}>{label(financialStatusLabels, d.financial_status)}</Badge>
            {review.count ? <Link href={`${base}/prestations`}><Badge tone="danger">{review.count} prestation(s) à revoir</Badge></Link> : null}
          </span>
        }
      />
      <RouteTabs tabs={tabs} exact={base} />
      {children}
    </>
  )
}
