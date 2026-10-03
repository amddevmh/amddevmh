import type { NextRequest } from 'next/server'
import { paymentMethodLabels, paymentStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { exportGuard, stamp } from '@/lib/fin/export'
import { csvAmount, csvResponse, toCsv } from '@/lib/fin/format'

export async function GET(request: NextRequest) {
  const guard = await exportGuard('finance')
  if (guard instanceof Response) return guard
  const p = request.nextUrl.searchParams
  const supabase = await createClient()
  let q = supabase
    .from('payments')
    .select('id, reference, direction, kind, method, amount, currency, fx_rate, amount_tnd, fees, withholding_amount, status, received_at, due_date, value_date, instrument_number, drawer_bank, external_ref, rejection_reason, clients(display_name), suppliers(name), treasury_accounts(name), deposit_slips(reference), payment_allocations(amount, invoices(number), dossiers(reference), supplier_invoices(supplier_ref))')
    .order('received_at')
    .limit(10000)
  for (const k of ['status', 'method', 'direction'] as const) {
    const v = p.get(k)
    if (v) q = q.eq(k, v as never)
  }
  if (p.get('client')) q = q.eq('client_id', p.get('client')!)
  if (p.get('supplier')) q = q.eq('supplier_id', p.get('supplier')!)
  if (p.get('from')) q = q.gte('received_at', p.get('from')!)
  if (p.get('to')) q = q.lte('received_at', p.get('to')!)
  const { data, error } = await q
  if (error) return new Response(error.message, { status: 400 })
  const csv = toCsv(
    ['Référence', 'Date réception', 'Sens', 'Type', 'Tiers', 'Moyen', 'N° chèque/traite', 'Banque tirée', 'Échéance', 'Date de valeur', 'Statut', 'Devise', 'Montant', 'Taux', 'Montant TND', 'Frais', 'Retenue', 'Compte trésorerie', 'Bordereau', 'Affectations', 'Réf. externe', 'Motif rejet'],
    (data ?? []).map((r) => [
      r.reference, r.received_at, r.direction === 'in' ? 'Entrée' : 'Sortie', r.kind, r.clients?.display_name ?? r.suppliers?.name,
      paymentMethodLabels[r.method], r.instrument_number, r.drawer_bank, r.due_date, r.value_date, paymentStatusLabels[r.status], r.currency,
      csvAmount(r.amount), r.fx_rate, csvAmount(r.amount_tnd), csvAmount(r.fees), csvAmount(r.withholding_amount), r.treasury_accounts?.name,
      r.deposit_slips?.reference,
      r.payment_allocations.map((a) => `${a.invoices?.number ?? a.supplier_invoices?.supplier_ref ?? a.dossiers?.reference ?? ''}=${csvAmount(a.amount)}`).join(' | '),
      r.external_ref, r.rejection_reason,
    ]),
  )
  return csvResponse(`reglements-${stamp()}.csv`, csv)
}
