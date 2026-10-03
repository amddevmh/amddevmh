import { type NextRequest } from 'next/server'
import { formatDateFr } from '@hi/core'
import { createClient } from '@hi/db/server'
import { getStaffSession } from '@/lib/auth'
import { csvResponse } from '@/lib/ops/csv'
import { detail, formatInZone } from '@/lib/ops/format'
import { paxTypeLabels } from '@/lib/ops/labels'

/**
 * Exports d’un départ (rooming list, passagers, transferts) : uniquement les colonnes nécessaires
 * au destinataire. Passeports seulement avec le droit « identity » ET une demande explicite.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session || !session.can('departures', 'export') || !session.can('dossiers')) return new Response('Accès refusé : export réservé aux profils habilités', { status: 403 })
  const { id } = await params
  const list = request.nextUrl.searchParams.get('liste') ?? 'rooming'
  const withPassports = request.nextUrl.searchParams.get('passeports') === '1' && session.can('identity')
  const supabase = await createClient()
  const { data: dep } = await supabase.from('departures').select('id, code').eq('id', id).maybeSingle()
  if (!dep) return new Response('Départ introuvable', { status: 404 })

  const { data: holds } = await supabase.from('departure_holds').select('dossier_id').eq('departure_id', id).eq('status', 'active').not('dossier_id', 'is', null)
  const { data: direct } = await supabase.from('dossiers').select('id').eq('departure_id', id)
  const dossierIds = [...new Set([...(direct ?? []).map((d) => d.id), ...(holds ?? []).map((h) => h.dossier_id as string)])]
  const { data: dossiers } = dossierIds.length
    ? await supabase.from('dossiers').select('id, reference').in('id', dossierIds).not('status', 'in', '(cancelled,archived)')
    : { data: [] }
  const refs = new Map((dossiers ?? []).map((d) => [d.id, d.reference]))
  const ids = [...refs.keys()]
  if (!ids.length) return csvResponse(`${list}-${dep.code}.csv`, [['Aucun dossier rattaché']])

  if (list === 'transferts') {
    const { data: services } = await supabase.from('services').select('id, dossier_id, description, start_at, local_timezone, start_date, status, details, linked_service_id')
      .in('dossier_id', ids).in('service_type', ['transfer', 'transport']).neq('status', 'cancelled').order('start_at')
    const linkedIds = (services ?? []).map((s) => s.linked_service_id).filter((x): x is string => !!x)
    const { data: linked } = linkedIds.length ? await supabase.from('services').select('id, description').in('id', linkedIds) : { data: [] }
    const linkedMap = new Map((linked ?? []).map((l) => [l.id, l.description]))
    const { data: leadTravellers } = await supabase.from('dossier_travellers').select('dossier_id, is_lead, travellers(first_name, last_name)').in('dossier_id', ids)
    const leadName = (dossierId: string) => {
      const rows = (leadTravellers ?? []).filter((t) => t.dossier_id === dossierId)
      const t = (rows.find((r) => r.is_lead) ?? rows[0])?.travellers as { first_name: string; last_name: string } | undefined
      return t ? `${t.first_name} ${t.last_name}` : ''
    }
    return csvResponse(`transferts-${dep.code}.csv`, [
      ['Dossier', 'Nom de référence', 'Prestation', 'Date / heure locale', 'Prise en charge', 'Destination', 'Passagers', 'Vol lié', 'Statut'],
      ...(services ?? []).map((s) => [refs.get(s.dossier_id), leadName(s.dossier_id), s.description,
        s.start_at ? formatInZone(s.start_at, s.local_timezone) : formatDateFr(s.start_date), detail(s.details, 'pickup'), detail(s.details, 'dropoff'),
        detail(s.details, 'pax_count'), s.linked_service_id ? linkedMap.get(s.linked_service_id) ?? '' : '', s.status === 'confirmed' ? 'Confirmé' : 'Non confirmé']),
    ])
  }

  const { data: travellers } = await supabase.from('dossier_travellers').select('dossier_id, room_label, special_requests, is_lead, traveller_id, travellers(first_name, last_name, birth_date, nationality, pax_type)').in('dossier_id', ids)
  const rows = (travellers ?? []).map((t) => ({ ...t, tr: t.travellers as { first_name: string; last_name: string; birth_date: string | null; nationality: string | null; pax_type: string } }))
    .sort((a, b) => (a.room_label ?? '~').localeCompare(b.room_label ?? '~') || (refs.get(a.dossier_id) ?? '').localeCompare(refs.get(b.dossier_id) ?? ''))

  if (list === 'passagers') {
    let passports = new Map<string, { passport_number: string; expiry_date: string | null; issuing_country: string | null }>()
    if (withPassports) {
      const { data: docs } = await supabase.from('traveller_identity_documents').select('traveller_id, passport_number, expiry_date, issuing_country').in('traveller_id', rows.map((r) => r.traveller_id))
      passports = new Map((docs ?? []).map((d) => [d.traveller_id, d]))
    }
    return csvResponse(`passagers-${dep.code}.csv`, [
      ['Dossier', 'Nom', 'Prénom', 'Type', 'Date de naissance', 'Nationalité', ...(withPassports ? ['Passeport', 'Pays émetteur', 'Expiration'] : [])],
      ...rows.map((r) => {
        const p = passports.get(r.traveller_id)
        return [refs.get(r.dossier_id), r.tr.last_name.toUpperCase(), r.tr.first_name, paxTypeLabels[r.tr.pax_type] ?? r.tr.pax_type, formatDateFr(r.tr.birth_date), r.tr.nationality,
          ...(withPassports ? [p?.passport_number ?? '', p?.issuing_country ?? '', p?.expiry_date ? formatDateFr(p.expiry_date) : ''] : [])]
      }),
    ])
  }

  return csvResponse(`rooming-${dep.code}.csv`, [
    ['Chambre', 'Nom', 'Prénom', 'Type', 'Dossier', 'Demandes particulières'],
    ...rows.map((r) => [r.room_label ?? 'À attribuer', r.tr.last_name.toUpperCase(), r.tr.first_name, paxTypeLabels[r.tr.pax_type] ?? r.tr.pax_type, refs.get(r.dossier_id), r.special_requests]),
  ])
}
