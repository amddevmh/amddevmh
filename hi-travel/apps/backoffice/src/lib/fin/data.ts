import 'server-only'
import { createClient } from '@hi/db/server'
import type { AgencyInfo } from '@/components/fin/common'

export type Supabase = Awaited<ReturnType<typeof createClient>>

export async function getAgency(supabase: Supabase): Promise<AgencyInfo> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'agency').maybeSingle()
  return (data?.value ?? {}) as AgencyInfo
}

export interface InvoiceFilters {
  kind?: string
  status?: string
  client?: string
  dossier?: string
  q?: string
  from?: string
  to?: string
}

/** Liste filtrée des factures, pro formas et avoirs (même requête pour l'écran et l'export). */
export function invoicesQuery(supabase: Supabase, f: InvoiceFilters, limit = 300) {
  let q = supabase
    .from('invoices')
    .select('id, kind, number, status, client_id, dossier_id, original_invoice_id, reason, issue_date, due_date, currency, total_ht, total_tax, stamp_amount, total_ttc, created_at, clients(display_name), dossiers(reference)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (f.kind) q = q.eq('kind', f.kind as 'invoice')
  if (f.status) q = q.eq('status', f.status as 'draft')
  if (f.client) q = q.eq('client_id', f.client)
  if (f.dossier) q = q.eq('dossier_id', f.dossier)
  if (f.q) q = q.ilike('number', `%${f.q}%`)
  if (f.from) q = q.gte('issue_date', f.from)
  if (f.to) q = q.lte('issue_date', f.to)
  return q
}

export async function listClients(supabase: Supabase) {
  const { data } = await supabase.from('clients').select('id, display_name').is('merged_into_id', null).order('display_name').limit(1000)
  return data ?? []
}

export async function listSuppliers(supabase: Supabase) {
  const { data } = await supabase.from('suppliers').select('id, name, currency, withholding_applicable').order('name').limit(1000)
  return data ?? []
}

export async function listTreasuryAccounts(supabase: Supabase) {
  const { data } = await supabase.from('treasury_accounts').select('id, name, kind, currency, account_code, active').order('kind').order('name')
  return data ?? []
}

export async function listDossiers(supabase: Supabase, clientId?: string) {
  let q = supabase.from('dossiers').select('id, reference, title, client_id, start_date, departure_id').order('created_at', { ascending: false }).limit(500)
  if (clientId) q = q.eq('client_id', clientId)
  const { data } = await q
  return data ?? []
}

/** Règle fiscale en vigueur à une date (une ligne par code). */
export async function activeTaxRules(supabase: Supabase, date: string, kind?: 'vat' | 'stamp' | 'withholding') {
  let q = supabase.from('tax_rules').select('*').lte('effective_from', date).order('effective_from', { ascending: false })
  if (kind) q = q.eq('kind', kind)
  const { data } = await q
  const byCode = new Map<string, NonNullable<typeof data>[number]>()
  for (const r of data ?? []) {
    if (r.effective_to && r.effective_to < date) continue
    if (!byCode.has(r.code)) byCode.set(r.code, r)
  }
  return [...byCode.values()]
}
