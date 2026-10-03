import { Card, CardBody, CardHeader } from '@hi/ui'
import { AuditList } from '@/components/ops/audit-list'
import { requireStaff } from '@/lib/auth'
import { db, getStaff } from '@/lib/ops/data'
import { getDossier } from '@/lib/ops/dossier'

export const metadata = { title: 'Dossier — historique' }

export default async function DossierHistoryTab({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('reports')
  const { id } = await params
  await getDossier(id)
  const supabase = await db()
  const [{ data: rows, error }, staff] = await Promise.all([
    supabase.from('audit_log').select('*')
      .or(`record_id.eq.${id},new_values->>dossier_id.eq.${id},old_values->>dossier_id.eq.${id}`)
      .order('created_at', { ascending: false }).limit(300),
    getStaff(),
  ])
  return (
    <Card>
      <CardHeader title="Historique des modifications" description={error ? `Erreur : ${error.message}` : 'Auteur, date, ancienne → nouvelle valeur et justification : dossier, prestations, échéancier, voyageurs, tâches, contrôles.'} />
      <CardBody><AuditList rows={rows ?? []} names={new Map(staff.map((s) => [s.id, s.full_name]))} /></CardBody>
    </Card>
  )
}
