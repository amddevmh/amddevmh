import type { NextRequest } from 'next/server'
import { createClient } from '@hi/db/server'
import { exportGuard, stamp } from '@/lib/fin/export'
import { csvAmount, csvResponse, firstDayOfYear, toCsv, todayTunis } from '@/lib/fin/format'

export async function GET(request: NextRequest) {
  const guard = await exportGuard('accounting')
  if (guard instanceof Response) return guard
  const p = request.nextUrl.searchParams
  const from = p.get('from') ?? firstDayOfYear()
  const to = p.get('to') ?? todayTunis()
  const supabase = await createClient()
  let q = supabase.from('general_ledger').select('*').gte('entry_date', from).lte('entry_date', to).order('account_code').order('entry_date').order('number').limit(50000)
  if (p.get('account')) q = q.eq('account_code', p.get('account')!)
  const { data, error } = await q
  if (error) return new Response(error.message, { status: 400 })
  const csv = toCsv(
    ['Compte', 'Libellé compte', 'Date', 'Journal', 'N° écriture', 'Pièce', 'Libellé', 'Débit', 'Crédit', 'Solde progressif (cumul)', 'Type source', 'Id source'],
    (data ?? []).map((l) => [l.account_code, l.account_label, l.entry_date, l.journal_code, l.number, l.piece_ref, l.label ?? l.entry_label, csvAmount(l.debit), csvAmount(l.credit), csvAmount(l.running_balance), l.source_type, l.source_id]),
  )
  return csvResponse(`grand-livre-${p.get('account') ?? 'tous'}-${from}-${to}-${stamp()}.csv`, csv)
}
