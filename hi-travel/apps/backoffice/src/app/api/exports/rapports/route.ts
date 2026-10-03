import type { NextRequest } from 'next/server'
import { activityLabels, label } from '@hi/core'
import { createClient } from '@hi/db/server'
import { exportGuard, stamp } from '@/lib/fin/export'
import { csvAmount, csvResponse, firstDayOfYear, toCsv } from '@/lib/fin/format'
import { dossierRows } from '@/lib/fin/reports'

/** Rentabilité par dossier : coûts et marges exportés uniquement avec le droit « marges ». */
export async function GET(request: NextRequest) {
  const guard = await exportGuard('reports')
  if (guard instanceof Response) return guard
  const margins = guard.can('margins', 'read')
  const p = request.nextUrl.searchParams
  const from = p.get('from') ?? firstDayOfYear()
  const to = p.get('to') ?? `${from.slice(0, 4)}-12-31`
  const supabase = await createClient()
  const rows = await dossierRows(supabase, {
    from, to, activity: p.get('activity') ?? undefined, owner: p.get('owner') ?? undefined, destination: p.get('destination') ?? undefined,
  })
  const headers = ['Dossier', 'Client', 'Activité', 'Destination', 'Responsable', 'Départ', 'Statut', 'Ventes prévues nettes', 'Facturé net', 'Réglé (validé)', 'Solde client']
  if (margins) headers.push('Coût prévu', 'Coût confirmé', 'Coût réel', 'Marge prévisionnelle', 'Marge confirmée', 'Marge réelle', 'État de la marge')
  const csv = toCsv(headers, rows.map((r) => {
    const base: unknown[] = [r.reference, r.meta?.clients?.display_name, label(activityLabels, r.activity), r.meta?.destination, r.meta?.owner?.full_name, r.start_date, r.status,
      csvAmount(r.sale_net), csvAmount(r.invoiced_net), csvAmount(r.paid), csvAmount(r.balance)]
    if (margins) base.push(csvAmount(r.cost_planned), csvAmount(r.cost_confirmed), csvAmount(r.cost_actual), csvAmount(r.margin_forecast), csvAmount(r.margin_confirmed),
      r.margin_state === 'final' ? csvAmount(r.margin_actual) : '', r.margin_state === 'final' ? 'définitive' : 'provisoire, coûts incomplets')
    return base
  }))
  return csvResponse(`rentabilite-dossiers-${from}-${to}-${stamp()}.csv`, csv)
}
