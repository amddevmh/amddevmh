import { formatDateTimeFr } from '@hi/core'
import { createClient } from '@hi/db/server'
import { getStaffSession } from '@/lib/auth'
import { csvResponse } from '@/lib/ops/csv'
import { attendanceLabels } from '@/lib/ops/labels'

/** Liste des participants (EVT03) : colonnes utiles à l’organisation uniquement. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session || !session.can('dossiers', 'export')) return new Response('Accès refusé', { status: 403 })
  const { id } = await params
  const supabase = await createClient()
  const { data: dossier } = await supabase.from('dossiers').select('reference').eq('id', id).maybeSingle()
  if (!dossier) return new Response('Dossier introuvable', { status: 404 })
  const { data } = await supabase.from('event_participants').select('*').eq('dossier_id', id).neq('attendance', 'cancelled').order('full_name')
  return csvResponse(`participants-${dossier.reference}.csv`, [
    ['Nom', 'Entreprise', 'Groupe', 'E-mail', 'Téléphone', 'Présence', 'Arrivée', 'Départ', 'Chambre', 'Contraintes'],
    ...(data ?? []).map((p) => [p.full_name, p.company, p.group_label, p.email, p.phone, attendanceLabels[p.attendance] ?? p.attendance,
      p.arrival_at ? formatDateTimeFr(p.arrival_at) : '', p.departure_at ? formatDateTimeFr(p.departure_at) : '', p.room_needs, p.constraints]),
  ])
}
