import { createClient } from '@hi/db/server'
import { exportGuard, stamp } from '@/lib/fin/export'
import { csvAmount, csvResponse, toCsv } from '@/lib/fin/format'

export async function GET() {
  const guard = await exportGuard('accounting')
  if (guard instanceof Response) return guard
  const supabase = await createClient()
  const { data, error } = await supabase.from('aged_receivables').select('*').order('display_name')
  if (error) return new Response(error.message, { status: 400 })
  const csv = toCsv(
    ['Client', 'Id client', 'Non échu', '0-30 j', '31-60 j', '+60 j', 'Total'],
    (data ?? []).map((r) => [r.display_name, r.client_id, csvAmount(r.not_due ?? 0), csvAmount(r.d0_30 ?? 0), csvAmount(r.d31_60 ?? 0), csvAmount(r.d60_plus ?? 0), csvAmount(r.total)]),
  )
  return csvResponse(`balance-agee-clients-${stamp()}.csv`, csv)
}
