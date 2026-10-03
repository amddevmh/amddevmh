import Link from 'next/link'
import { createClient } from '@hi/db/server'
import { Card, DateText, EmptyState, Input, Select, Stat, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { listSuppliers } from '@/lib/fin/data'
import { n, sp, todayTunis, type SearchParams } from '@/lib/fin/format'

export const metadata = { title: 'Pièces fournisseurs' }

const STATUS = { draft: 'Brouillon', validated: 'Validée', cancelled: 'Annulée' }

export default async function SupplierInvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('finance', 'read')
  const params = await searchParams
  const f = { supplier: sp(params.supplier), status: sp(params.status), q: sp(params.q), open: sp(params.open), unallocated: sp(params.unallocated) }
  const supabase = await createClient()
  let q = supabase.from('supplier_invoice_balances').select('*').order('issue_date', { ascending: false }).limit(300)
  if (f.supplier) q = q.eq('supplier_id', f.supplier)
  if (f.status) q = q.eq('status', f.status)
  if (f.q) q = q.ilike('supplier_ref', `%${f.q}%`)
  if (f.open) q = q.gt('remaining', 0).eq('status', 'validated')
  if (f.unallocated) q = q.gt('unallocated', 0).neq('status', 'cancelled')
  const [{ data }, suppliers] = await Promise.all([q, listSuppliers(supabase)])
  const rows = data ?? []
  const names = new Map(suppliers.map((s) => [s.id, s.name]))
  const today = todayTunis()
  const due = rows.filter((r) => r.status === 'validated' && n(r.remaining) > 0)

  return (
    <>
      <PageHeader
        title="Pièces fournisseurs"
        description="Montant dû, payé, restant et ventilation des coûts entre dossiers, départs et prestations, sans double comptage (FIN03)."
        actions={session.can('finance', 'create') ? <Link className={buttonClass('primary')} href="/finances/fournisseurs/nouvelle">Nouvelle pièce</Link> : null}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Pièces à payer" value={due.length} hint="Pièces validées non soldées" href="/finances/fournisseurs?open=1" />
        <Stat label="Échues" value={due.filter((r) => r.due_date && r.due_date < today).length} tone="danger" href="/finances/fournisseurs?open=1" />
        <Stat label="À ventiler" value={rows.filter((r) => r.status !== 'cancelled' && n(r.unallocated) > 0).length} hint="Coûts non affectés aux dossiers" href="/finances/fournisseurs?unallocated=1" tone="warning" />
      </div>
      <FilterBar>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-supplier">Fournisseur</label>
          <Select id="f-supplier" name="supplier" defaultValue={f.supplier ?? ''} className="w-56">
            <option value="">Tous</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-status">Statut</label>
          <Select id="f-status" name="status" defaultValue={f.status ?? ''} className="w-36">
            <option value="">Tous</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-q">Référence</label>
          <Input id="f-q" name="q" defaultValue={f.q ?? ''} className="w-40" />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="open" value="1" defaultChecked={!!f.open} /> Non soldées</label>
      </FilterBar>
      <Card>
        {rows.length === 0 ? <EmptyState title="Aucune pièce fournisseur" /> : (
          <Table>
            <thead>
              <tr><Th>Référence</Th><Th>Fournisseur</Th><Th>Statut</Th><Th>Date</Th><Th>Échéance</Th><Th className="text-right">Montant</Th><Th className="text-right">Retenue</Th><Th className="text-right">Payé</Th><Th className="text-right">Restant</Th><Th className="text-right">Non ventilé</Th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supplier_invoice_id} className="hover:bg-canvas/60">
                  <Td><Link className="font-medium text-brand-600 hover:underline" href={`/finances/fournisseurs/${r.supplier_invoice_id}`}>{r.supplier_ref}</Link></Td>
                  <Td>{names.get(r.supplier_id ?? '')}</Td>
                  <Td><StatusBadge status={r.status} labels={STATUS} /></Td>
                  <Td><DateText value={r.issue_date} /></Td>
                  <Td><DateText value={r.due_date} className={r.due_date && r.due_date < today && n(r.remaining) > 0 && r.status === 'validated' ? 'text-danger-700' : undefined} /></Td>
                  <MoneyTd value={r.total_amount} currency={r.currency ?? 'TND'} />
                  <MoneyTd value={r.withholding_amount} currency={r.currency ?? 'TND'} />
                  <MoneyTd value={r.paid} currency={r.currency ?? 'TND'} />
                  <MoneyTd value={r.remaining} currency={r.currency ?? 'TND'} strong />
                  <MoneyTd value={r.unallocated} currency={r.currency ?? 'TND'} className={n(r.unallocated) > 0 ? 'text-warning-600' : 'text-muted'} />
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-2 text-xs text-muted">Montants dans la devise de chaque pièce.</p>
    </>
  )
}
