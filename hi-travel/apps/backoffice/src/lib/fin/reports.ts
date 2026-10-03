import 'server-only'
import type { Supabase } from './data'
import { n } from './format'

export interface ReportFilters {
  from: string
  to: string
  activity?: string
  /** Nom du responsable, comme renvoyé par management_kpis */
  owner?: string
  destination?: string
}

/** Dossiers de la période (date de départ), avec indicateurs financiers communs (vue dossier_financials). */
export async function dossierRows(supabase: Supabase, f: ReportFilters) {
  let q = supabase
    .from('dossier_financials')
    .select('*')
    .gte('start_date', f.from)
    .lte('start_date', f.to)
    .neq('status', 'cancelled')
    .order('start_date')
    .limit(5000)
  if (f.activity) q = q.eq('activity', f.activity as 'hotel_tn')
  const { data: fin } = await q
  const ids = (fin ?? []).map((r) => r.dossier_id).filter((x): x is string => !!x)
  const { data: meta } = ids.length
    ? await supabase.from('dossiers').select('id, title, destination, departure_id, clients(display_name), owner:staff_profiles!dossiers_owner_id_fkey(full_name)').in('id', ids)
    : { data: [] }
  const metaById = new Map((meta ?? []).map((m) => [m.id, m]))
  return (fin ?? [])
    .map((r) => ({ ...r, meta: metaById.get(r.dossier_id ?? '') }))
    .filter((r) => !f.destination || (r.meta?.destination ?? '—') === f.destination)
    .filter((r) => !f.owner || (r.meta?.owner?.full_name ?? '—') === f.owner)
}

export type DossierRow = Awaited<ReturnType<typeof dossierRows>>[number]

/** Résultat de gestion par départ : somme des dossiers rattachés + coûts communs ventilés sur le départ. */
export async function departureResults(supabase: Supabase, rows: DossierRow[]) {
  const depIds = [...new Set(rows.map((r) => r.meta?.departure_id).filter((x): x is string => !!x))]
  if (depIds.length === 0) return []
  const [{ data: deps }, { data: common }] = await Promise.all([
    supabase.from('departures').select('id, code, start_date, capacity, seats_confirmed, offers(title)').in('id', depIds),
    supabase.from('cost_allocations').select('departure_id, amount_tnd, dossier_id, service_id').in('departure_id', depIds).eq('status', 'validated'),
  ])
  return (deps ?? []).map((d) => {
    const ds = rows.filter((r) => r.meta?.departure_id === d.id)
    const commonCost = (common ?? []).filter((c) => c.departure_id === d.id && !c.dossier_id && !c.service_id).reduce((a, c) => a + n(c.amount_tnd), 0)
    const sum = (k: 'sale_net' | 'invoiced_net' | 'paid' | 'cost_planned' | 'cost_actual') => ds.reduce((a, r) => a + n(r[k]), 0)
    const costActual = sum('cost_actual') + commonCost
    return {
      id: d.id, code: d.code, title: d.offers?.title ?? '', start_date: d.start_date, seats: d.seats_confirmed, capacity: d.capacity,
      dossiers: ds.length, sale_net: sum('sale_net'), invoiced_net: sum('invoiced_net'), paid: sum('paid'),
      cost_planned: sum('cost_planned'), common_cost: commonCost, cost_actual: costActual,
      result_forecast: sum('sale_net') - sum('cost_planned') - commonCost,
      result_actual: sum('sale_net') - costActual,
      provisional: ds.some((r) => r.margin_state === 'provisional') || ds.length === 0,
    }
  })
}
