import Link from 'next/link'
import { invoiceKindLabels, invoiceStatusLabels, sumMoney, formatMoney } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Card, DateText, EmptyState, Input, Select, Stat, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { MoneyTd } from '@/components/fin/common'
import { requireStaff } from '@/lib/auth'
import { invoicesQuery, listClients } from '@/lib/fin/data'
import { isUuid, sp, type SearchParams } from '@/lib/fin/format'

export const metadata = { title: 'Factures et avoirs' }

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('finance', 'read')
  const params = await searchParams
  const supabase = await createClient()

  // Le filtre dossier accepte l'identifiant ou la référence (DOS-…)
  let dossierId = sp(params.dossier)
  const dossierRef = dossierId && !isUuid(dossierId) ? dossierId : undefined
  if (dossierRef) {
    const { data } = await supabase.from('dossiers').select('id').ilike('reference', dossierRef).maybeSingle()
    dossierId = data?.id ?? '00000000-0000-0000-0000-000000000000'
  }
  const filters = {
    kind: sp(params.kind), status: sp(params.status), client: sp(params.client), dossier: dossierId,
    q: sp(params.q), from: sp(params.from), to: sp(params.to),
  }
  const [{ data: invoices, error }, clients] = await Promise.all([invoicesQuery(supabase, filters), listClients(supabase)])

  const rows = invoices ?? []
  const validated = rows.filter((r) => r.status === 'validated')
  const invoiced = sumMoney(validated.filter((r) => r.kind === 'invoice').map((r) => r.total_ttc))
  const credited = sumMoney(validated.filter((r) => r.kind === 'credit_note').map((r) => r.total_ttc))
  const drafts = rows.filter((r) => r.status === 'draft').length

  const qs = new URLSearchParams(Object.entries({ ...filters, dossier: sp(params.dossier) }).filter(([, v]) => v) as [string, string][])
  const link = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams(qs)
    for (const [k, v] of Object.entries(patch)) if (v) u.set(k, v); else u.delete(k)
    return `/finances/factures?${u.toString()}`
  }

  return (
    <>
      <PageHeader
        title="Factures et avoirs"
        description="Pro formas, factures et avoirs. Les pro formas ne contribuent pas au chiffre d’affaires facturé (FIN01)."
        actions={
          <>
            {session.can('finance', 'export') ? (
              <a className={buttonClass('secondary')} href={`/api/exports/factures?${qs.toString()}`}>Exporter CSV</a>
            ) : null}
            {session.can('finance', 'create') ? (
              <>
                <Link className={buttonClass('secondary')} href="/finances/factures/nouvelle?kind=proforma">Nouvelle pro forma</Link>
                <Link className={buttonClass('primary')} href="/finances/factures/nouvelle">Nouvelle facture</Link>
              </>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Facturé (validé)" value={formatMoney(invoiced)} hint="Factures validées, hors pro formas" href={link({ kind: 'invoice', status: 'validated' })} />
        <Stat label="Avoirs (validés)" value={formatMoney(credited)} href={link({ kind: 'credit_note', status: 'validated' })} />
        <Stat label="Facturation nette" value={formatMoney(invoiced - credited)} hint="Factures − avoirs, pour les filtres actifs" tone="success" />
        <Stat label="Brouillons" value={drafts} hint="Non numérotés, sans effet comptable" href={link({ status: 'draft' })} tone={drafts ? 'warning' : 'neutral'} />
      </div>

      <FilterBar>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-kind">Type</label>
          <Select id="f-kind" name="kind" defaultValue={filters.kind ?? ''} className="w-40">
            <option value="">Tous</option>
            {Object.entries(invoiceKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-status">Statut</label>
          <Select id="f-status" name="status" defaultValue={filters.status ?? ''} className="w-36">
            <option value="">Tous</option>
            {Object.entries(invoiceStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-client">Client</label>
          <Select id="f-client" name="client" defaultValue={filters.client ?? ''} className="w-56">
            <option value="">Tous</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-dossier">Dossier</label>
          <Input id="f-dossier" name="dossier" placeholder="DOS-2026-…" defaultValue={sp(params.dossier) ?? ''} className="w-40" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-q">Numéro</label>
          <Input id="f-q" name="q" placeholder="FAC-…" defaultValue={filters.q ?? ''} className="w-36" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-from">Émise du</label>
          <Input id="f-from" type="date" name="from" defaultValue={filters.from ?? ''} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-to">au</label>
          <Input id="f-to" type="date" name="to" defaultValue={filters.to ?? ''} />
        </div>
      </FilterBar>

      <Card>
        {error ? <p className="p-4 text-sm text-danger-700">{error.message}</p> : null}
        {rows.length === 0 ? (
          <EmptyState title="Aucune pièce" description="Aucune facture, pro forma ou avoir ne correspond aux filtres." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Numéro</Th>
                <Th>Type</Th>
                <Th>Statut</Th>
                <Th>Client</Th>
                <Th>Dossier</Th>
                <Th>Émission</Th>
                <Th>Échéance</Th>
                <Th className="text-right">Total HT</Th>
                <Th className="text-right">Total TTC</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <Td>
                    <Link className="font-medium text-brand-600 hover:underline" href={`/finances/factures/${r.id}`}>
                      {r.number ?? 'Brouillon'}
                    </Link>
                  </Td>
                  <Td>{invoiceKindLabels[r.kind]}</Td>
                  <Td><StatusBadge status={r.status} labels={invoiceStatusLabels} /></Td>
                  <Td>
                    <Link className="hover:underline" href={`/finances/clients/${r.client_id}`}>{r.clients?.display_name}</Link>
                  </Td>
                  <Td>{r.dossiers ? <Link className="hover:underline" href={`/dossiers/${r.dossier_id}`}>{r.dossiers.reference}</Link> : '—'}</Td>
                  <Td><DateText value={r.issue_date} /></Td>
                  <Td><DateText value={r.due_date} /></Td>
                  <MoneyTd value={r.status === 'draft' ? null : r.total_ht} />
                  <MoneyTd value={r.status === 'draft' ? null : (r.kind === 'credit_note' ? -Number(r.total_ttc) : r.total_ttc)} strong />
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {rows.length >= 300 ? <p className="mt-2 text-xs text-muted">Affichage limité aux 300 dernières pièces : affinez les filtres.</p> : null}
    </>
  )
}
