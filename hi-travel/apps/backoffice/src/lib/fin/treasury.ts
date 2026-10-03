import 'server-only'
import type { Supabase } from './data'

/** Solde théorique d'un compte de trésorerie à une date (solde initial daté + mouvements du seul compte). */
export async function expectedBalanceAt(supabase: Supabase, accountId: string, date: string): Promise<number | null> {
  const { data: acc } = await supabase.from('treasury_accounts').select('opening_balance, opening_date').eq('id', accountId).maybeSingle()
  if (!acc) return null
  const { data: mv } = await supabase
    .from('treasury_movements')
    .select('amount')
    .eq('treasury_account_id', accountId)
    .gte('movement_date', acc.opening_date)
    .lte('movement_date', date)
  const minor = (mv ?? []).reduce((a, m) => a + Math.round(Number(m.amount) * 1000), Math.round(Number(acc.opening_balance) * 1000))
  return minor / 1000
}
