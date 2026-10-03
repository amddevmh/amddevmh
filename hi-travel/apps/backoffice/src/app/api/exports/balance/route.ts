import type { NextRequest } from 'next/server'
import { createClient } from '@hi/db/server'
import { exportGuard, stamp } from '@/lib/fin/export'
import { csvAmount, csvResponse, firstDayOfYear, n, toCsv, todayTunis } from '@/lib/fin/format'

export async function GET(request: NextRequest) {
  const guard = await exportGuard('accounting')
  if (guard instanceof Response) return guard
  const p = request.nextUrl.searchParams
  const from = p.get('from') ?? firstDayOfYear()
  const to = p.get('to') ?? todayTunis()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('trial_balance', { p_from: from, p_to: to })
  if (error) return new Response(error.message, { status: 400 })
  const rows = (data ?? []).map((r) => [r.account_code, r.account_label, csvAmount(r.debit), csvAmount(r.credit), csvAmount(n(r.balance) > 0 ? r.balance : 0), csvAmount(n(r.balance) < 0 ? -n(r.balance) : 0)])
  const d = (data ?? []).reduce((a, r) => a + n(r.debit), 0)
  const c = (data ?? []).reduce((a, r) => a + n(r.credit), 0)
  rows.push(['TOTAL', `Période ${from} → ${to}`, csvAmount(d), csvAmount(c), '', ''])
  const csv = toCsv(['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde débiteur', 'Solde créditeur'], rows)
  return csvResponse(`balance-${from}-${to}-${stamp()}.csv`, csv)
}
