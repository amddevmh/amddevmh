import { formatDateTimeFr } from '@hi/core'
import { Alert, Card, CardBody, CardHeader } from '@hi/ui'
import { DocumentTable, type DocRow } from '@/components/ops/document-table'
import { DocumentUpload } from '@/components/ops/document-upload'
import { requireStaff } from '@/lib/auth'
import { db, getStaff } from '@/lib/ops/data'
import { getDossier, getDossierServices } from '@/lib/ops/dossier'

export const metadata = { title: 'Dossier — documents' }

const ACTIONS: Record<string, string> = { view: 'consultation', download: 'téléchargement', upload: 'dépôt', publish: 'publication', unpublish: 'retrait' }

export default async function DocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('documents')
  const { id } = await params
  await getDossier(id)
  const supabase = await db()
  const [{ data: docs }, services, staff, { data: links }] = await Promise.all([
    supabase.from('documents').select('*, services!documents_service_id_fkey(description)').eq('dossier_id', id).order('created_at', { ascending: false }),
    getDossierServices(id),
    getStaff(),
    supabase.from('dossier_travellers').select('traveller_id, travellers(first_name, last_name)').eq('dossier_id', id),
  ])
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const docIds = (docs ?? []).map((d) => d.id)
  const { data: log } = session.can('reports') && docIds.length
    ? await supabase.from('document_access_log').select('*').in('document_id', docIds).order('created_at', { ascending: false }).limit(30)
    : { data: null }
  const titles = new Map((docs ?? []).map((d) => [d.id, d.title]))

  return (
    <div className="space-y-6">
      {!session.can('identity') ? <Alert tone="info">Les pièces d’identité et documents sensibles ne sont pas visibles avec votre profil.</Alert> : null}
      {session.can('documents', 'create') ? (
        <Card>
          <CardHeader title="Déposer un document" description="Bucket privé ; aucune URL publique. Les pièces d’identité sont automatiquement sensibles." />
          <CardBody>
            <DocumentUpload
              dossierId={id}
              services={services.filter((s) => s.status !== 'cancelled').map((s) => ({ id: s.id, description: s.description }))}
              travellers={(links ?? []).map((l) => {
                const t = l.travellers as { first_name: string; last_name: string } | null
                return { id: l.traveller_id, name: t ? `${t.first_name} ${t.last_name}` : l.traveller_id }
              })}
              canIdentity={session.can('identity', 'update')}
            />
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title={`Documents du dossier (${docs?.length ?? 0})`} />
        <CardBody><DocumentTable docs={(docs ?? []) as DocRow[]} names={names} canPublish={session.can('documents', 'update')} /></CardBody>
      </Card>
      {log ? (
        <Card>
          <CardHeader title="Journal d’accès" description="Consultations, téléchargements, dépôts et publications." />
          <CardBody>
            {log.length ? (
              <ul className="space-y-1 text-sm">
                {log.map((l) => <li key={l.id}>{formatDateTimeFr(l.created_at)} — {l.user_id ? names.get(l.user_id) ?? 'Client' : '—'} — {ACTIONS[l.action] ?? l.action} — {titles.get(l.document_id)}</li>)}
              </ul>
            ) : <p className="text-sm text-muted">Aucun accès enregistré.</p>}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
