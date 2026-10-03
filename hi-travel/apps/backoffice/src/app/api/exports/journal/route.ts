import type { NextRequest } from 'next/server'
import { createClient } from '@hi/db/server'
import { exportGuard, stamp } from '@/lib/fin/export'
import { csvAmount, csvResponse, lastDayOfMonth, toCsv, todayTunis } from '@/lib/fin/format'

/** Export du journal : écritures validées avec n°, pièce et source (type + identifiant) pour retrouver la pièce. */
export async function GET(request: NextRequest) {
  const guard = await exportGuard('accounting')
  if (guard instanceof Response) return guard
  const p = request.nextUrl.searchParams
  const month = p.get('month') ?? todayTunis().slice(0, 7)
  const from = p.get('from') ?? `${month}-01`
  const to = p.get('to') ?? lastDayOfMonth(month)
  const supabase = await createClient()
  let q = supabase.from('general_ledger').select('*').gte('entry_date', from).lte('entry_date', to).order('entry_date').order('number').limit(50000)
  if (p.get('journal')) q = q.eq('journal_code', p.get('journal')!)
  const { data, error } = await q
  if (error) return new Response(error.message, { status: 400 })
  const csv = toCsv(
    ['Date', 'Journal', 'N° écriture', 'Pièce', 'Compte', 'Libellé compte', 'Libellé', 'Débit', 'Crédit', 'Type source', 'Id source'],
    (data ?? []).map((l) => [l.entry_date, l.journal_code, l.number, l.piece_ref, l.account_code, l.account_label, l.label ?? l.entry_label, csvAmount(l.debit), csvAmount(l.credit), l.source_type, l.source_id]),
  )
  return csvResponse(`journal-${p.get('journal') ?? 'tous'}-${month}-${stamp()}.csv`, csv)
}
