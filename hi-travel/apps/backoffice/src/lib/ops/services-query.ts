import 'server-only'
import type { ServiceListRow } from '@/components/ops/services-list'
import { db, ilikeValue } from './data'

export interface ServiceFilters {
  activity?: string
  statuses?: string[]
  expiring48h?: boolean
  review?: boolean
  supplierId?: string
  q?: string
  from?: string
  to?: string
}

/** Prestations des dossiers en cours (hors dossiers annulés / archivés), avec dossier, client et fournisseur. */
export async function fetchServices(f: ServiceFilters, limit = 400): Promise<{ rows: ServiceListRow[]; error?: string }> {
  const supabase = await db()
  let q = supabase.from('services')
    .select('id, dossier_id, activity, service_type, description, status, start_date, end_date, start_at, local_timezone, option_deadline, confirmation_ref, needs_review, review_reason, sale_price, nights, details, end_at, suppliers(name), dossiers!inner(reference, start_date, end_date, status, clients(display_name))')
    .not('dossiers.status', 'in', '(cancelled,archived)')
  if (f.activity) q = q.eq('activity', f.activity as never)
  if (f.statuses?.length) q = q.in('status', f.statuses as never[])
  if (f.expiring48h) q = q.eq('status', 'option').lt('option_deadline', new Date(Date.now() + 48 * 3600_000).toISOString())
  if (f.review) q = q.eq('needs_review', true)
  if (f.supplierId) q = q.eq('supplier_id', f.supplierId)
  if (f.q) q = q.ilike('description', ilikeValue(f.q))
  if (f.from) q = q.gte('start_date', f.from)
  if (f.to) q = q.lte('start_date', f.to)
  const { data, error } = await q.order('start_date', { ascending: true, nullsFirst: false }).limit(limit)
  return { rows: (data ?? []) as unknown as ServiceListRow[], error: error?.message }
}
