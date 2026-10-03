import Link from 'next/link'
import { formatMoney } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, DateText, EmptyState, Input, Select, Table, Td, Th, buttonClass, cn } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { FilterBar, PageHeader } from '@/components/page'
import { AccountingTabs } from '@/components/fin/accounting-tabs'
import { MoneyTd } from '@/components/fin/common'
import { Notice } from '@/components/fin/notice'
import { requireStaff } from '@/lib/auth'
import { n, sp, type SearchParams } from '@/lib/fin/format'
import { postEntry } from './actions'

export const metadata = { title: 'Comptabilité — brouillard' }

const SOURCE: Record<string, string> = { invoice: 'Facture / avoir', payment: 'Règlement', supplier_invoice: 'Pièce fournisseur', transfer: 'Transfert', manual: 'Saisie manuelle' }

export default async function DraftsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('accounting', 'read')
  const params = await searchParams
  const f = { journal: sp(params.journal), from: sp(params.from), to: sp(params.to), issue: sp(params.issue) }
  const supabase = await createClient()
  let q = supabase
    .from('journal_entries')
    .select('id, journal_code, entry_date, piece_ref, label, source_type, source_id, created_at, journal_lines(id, account_code, label, debit, credit)')
    .eq('status', 'draft')
    .order('entry_date')
    .order('created_at')
    .limit(300)
  if (f.journal) q = q.eq('journal_code', f.journal)
  if (f.from) q = q.gte('entry_date', f.from)
  if (f.to) q = q.lte('entry_date', f.to)
  const [{ data: entries }, { data: accounts }, { data: journals }, { data: periods }] = await Promise.all([
    q,
    supabase.from('accounts').select('code, label, active, allow_posting'),
    supabase.from('journals').select('code, label').order('code'),
    supabase.from('fiscal_periods').select('start_date, end_date, status'),
  ])
  const accountByCode = new Map((accounts ?? []).map((a) => [a.code, a]))
  const periodOpen = (d: string) => (periods ?? []).some((p) => p.status === 'open' && d >= p.start_date && d <= p.end_date)

  const analysed = (entries ?? []).map((e) => {
    const debit = e.journal_lines.reduce((a, l) => a + Math.round(n(l.debit) * 1000), 0) / 1000
    const credit = e.journal_lines.reduce((a, l) => a + Math.round(n(l.credit) * 1000), 0) / 1000
    const unknown = e.journal_lines.filter((l) => {
      const a = accountByCode.get(l.account_code)
      return !a || !a.active || !a.allow_posting
    }).map((l) => l.account_code)
    const issues: string[] = []
    if (debit !== credit) issues.push(`Déséquilibre : débit ${formatMoney(debit)} ≠ crédit ${formatMoney(credit)}`)
    if (unknown.length) issues.push(`Compte inconnu ou non autorisé : ${[...new Set(unknown)].join(', ')}`)
    if (!periodOpen(e.entry_date)) issues.push('Date hors période ouverte')
    if (!e.piece_ref) issues.push('Pièce non référencée')
    if (e.journal_lines.length < 2) issues.push('Moins de deux lignes')
    return { ...e, debit, credit, unknown: new Set(unknown), issues }
  })
  const shown = f.issue ? analysed.filter((e) => e.issues.length > 0) : analysed

  return (
    <>
      <PageHeader
        title="Comptabilité"
        description="Brouillard : écritures générées par les règles approuvées ou saisies manuellement, à contrôler puis valider (FIN05). La validation est atomique."
        actions={
          <>
            {session.can('accounting', 'create') ? <Link className={buttonClass('primary')} href="/comptabilite/saisie">Nouvelle saisie (OD)</Link> : null}
          </>
        }
      />
      <Notice code={sp(params.notice)} refValue={sp(params.ref)} />
      <AccountingTabs current="/comptabilite" draftCount={analysed.length} />
      <FilterBar>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="f-journal">Journal</label>
          <Select id="f-journal" name="journal" defaultValue={f.journal ?? ''} className="w-48">
            <option value="">Tous</option>
            {(journals ?? []).map((j) => <option key={j.code} value={j.code}>{j.code} — {j.label}</option>)}
          </Select>
        </div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-from">Du</label><Input id="f-from" type="date" name="from" defaultValue={f.from ?? ''} /></div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-to">au</label><Input id="f-to" type="date" name="to" defaultValue={f.to ?? ''} /></div>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="issue" value="1" defaultChecked={!!f.issue} /> Pièces en anomalie uniquement</label>
      </FilterBar>

      {analysed.some((e) => e.issues.length) ? (
        <Alert tone="warning" className="mb-4">
          {analysed.filter((e) => e.issues.length).length} pièce(s) présentent une anomalie : elles seront refusées par la base tant qu’elles ne sont pas corrigées.
        </Alert>
      ) : null}

      {shown.length === 0 ? (
        <Card><EmptyState title="Brouillard vide" description="Aucune écriture en attente de validation pour ces filtres." /></Card>
      ) : (
        <div className="space-y-4">
          {shown.map((e) => (
            <Card key={e.id} className={cn(e.issues.length ? 'border-danger-600/40 ring-1 ring-danger-600/20' : undefined)}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3">
                <div>
                  <p className="font-medium text-brand-900">
                    <span className="mr-2 rounded bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-700">{e.journal_code}</span>
                    {e.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Pièce <span className="font-mono">{e.piece_ref ?? '—'}</span> · <DateText value={e.entry_date} /> · {SOURCE[e.source_type ?? ''] ?? e.source_type ?? '—'}
                    {e.source_type === 'invoice' && e.source_id ? <> · <Link className="text-brand-600 hover:underline" href={`/finances/factures/${e.source_id}`}>voir la pièce source</Link></> : null}
                    {e.source_type === 'payment' && e.source_id ? <> · <Link className="text-brand-600 hover:underline" href={`/finances/reglements/${e.source_id}`}>voir le règlement</Link></> : null}
                    {e.source_type === 'supplier_invoice' && e.source_id ? <> · <Link className="text-brand-600 hover:underline" href={`/finances/fournisseurs/${e.source_id}`}>voir la pièce fournisseur</Link></> : null}
                  </p>
                  {e.issues.map((i) => <Badge key={i} tone="danger" className="mr-1 mt-1">{i}</Badge>)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {e.source_type === 'manual' && session.can('accounting', 'update') ? (
                    <Link className={buttonClass('ghost', 'sm')} href={`/comptabilite/saisie?entry=${e.id}`}>Corriger</Link>
                  ) : null}
                  {session.can('accounting', 'validate') ? (
                    <ActionForm action={postEntry}>
                      <input type="hidden" name="entry_id" value={e.id} />
                      <SubmitButton size="sm" pendingLabel="Validation…" confirm="Valider définitivement cette pièce ? Elle ne pourra plus être modifiée (contrepassation uniquement).">Valider</SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
              </div>
              <Table>
                <thead><tr><Th>Compte</Th><Th>Libellé</Th><Th className="text-right">Débit</Th><Th className="text-right">Crédit</Th></tr></thead>
                <tbody>
                  {e.journal_lines.map((l) => (
                    <tr key={l.id}>
                      <Td className={cn('font-mono text-sm', e.unknown.has(l.account_code) && 'font-semibold text-danger-700')}>
                        {l.account_code} <span className="font-sans text-xs text-muted">{accountByCode.get(l.account_code)?.label ?? 'compte inconnu'}</span>
                      </Td>
                      <Td className="text-sm">{l.label}</Td>
                      <MoneyTd value={n(l.debit) || null} />
                      <MoneyTd value={n(l.credit) || null} />
                    </tr>
                  ))}
                  <tr className={cn('font-semibold', e.debit !== e.credit && 'text-danger-700')}>
                    <Td colSpan={2} className="text-right text-xs uppercase">Totaux</Td>
                    <MoneyTd value={e.debit} />
                    <MoneyTd value={e.credit} />
                  </tr>
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
