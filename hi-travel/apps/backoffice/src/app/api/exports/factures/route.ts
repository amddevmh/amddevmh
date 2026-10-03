import type { NextRequest } from 'next/server'
import { invoiceKindLabels, invoiceStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { invoicesQuery } from '@/lib/fin/data'
import { exportGuard, stamp } from '@/lib/fin/export'
import { csvAmount, csvResponse, isUuid, toCsv } from '@/lib/fin/format'

export async function GET(request: NextRequest) {
  const guard = await exportGuard('finance')
  if (guard instanceof Response) return guard
  const p = request.nextUrl.searchParams
  const supabase = await createClient()
  let dossier = p.get('dossier') ?? undefined
  if (dossier && !isUuid(dossier)) {
    const { data } = await supabase.from('dossiers').select('id').ilike('reference', dossier).maybeSingle()
    dossier = data?.id ?? '00000000-0000-0000-0000-000000000000'
  }
  const { data, error } = await invoicesQuery(supabase, {
    kind: p.get('kind') ?? undefined, status: p.get('status') ?? undefined, client: p.get('client') ?? undefined, dossier,
    q: p.get('q') ?? undefined, from: p.get('from') ?? undefined, to: p.get('to') ?? undefined,
  }, 10000)
  if (error) return new Response(error.message, { status: 400 })
  const csv = toCsv(
    ['Numéro', 'Type', 'Statut', 'Client', 'Dossier', 'Date émission', 'Échéance', 'Devise', 'Total HT', 'Taxes', 'Timbre', 'Total TTC', 'Facture d’origine (id)', 'Motif', 'Identifiant pièce'],
    (data ?? []).map((r) => [
      r.number ?? 'BROUILLON', invoiceKindLabels[r.kind], invoiceStatusLabels[r.status], r.clients?.display_name, r.dossiers?.reference,
      r.issue_date, r.due_date, r.currency, csvAmount(r.total_ht), csvAmount(r.total_tax), csvAmount(r.stamp_amount), csvAmount(r.total_ttc),
      r.original_invoice_id, r.reason, r.id,
    ]),
  )
  return csvResponse(`factures-${stamp()}.csv`, csv)
}
