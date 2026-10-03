import Link from 'next/link'
import { formatDateFr, invoiceKindLabels, invoiceStatusLabels, label, paymentMethodLabels, paymentStatusLabels, toMinor } from '@hi/core'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Input, Money, Select, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { requireStaff } from '@/lib/auth'
import { saveScheduleItem } from '@/lib/ops/actions/dossiers'
import { db } from '@/lib/ops/data'
import { getDossier } from '@/lib/ops/dossier'
import { todayIso } from '@/lib/ops/format'
import { scheduleKindLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Dossier — échéancier et paiements' }

export default async function PaymentsTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('dossiers')
  const { id } = await params
  const d = await getDossier(id)
  const supabase = await db()
  const canFinance = session.can('finance')
  const [{ data: items }, { data: fin }, allocations, invoices] = await Promise.all([
    supabase.from('payment_schedule_items').select('*').eq('dossier_id', id).order('due_date', { nullsFirst: false }).order('seq'),
    supabase.from('dossier_financials').select('sale_net, paid, balance, overdue, scheduled').eq('dossier_id', id).maybeSingle(),
    canFinance ? supabase.from('payment_allocations').select('id, amount, created_at, invoice_id, payments(id, reference, method, amount, status, received_at, direction, kind, external_ref)').eq('dossier_id', id).order('created_at') : Promise.resolve({ data: null }),
    canFinance ? supabase.from('invoices').select('id, number, kind, status, total_ttc, issue_date, due_date').eq('dossier_id', id).order('created_at') : Promise.resolve({ data: null }),
  ])
  const canEdit = session.can('dossiers', 'update') || session.can('finance', 'update')
  const total = Number(fin?.sale_net ?? d.total_price)
  const scheduled = (items ?? []).reduce((a, i) => a + toMinor(i.amount), 0) / 1000
  const today = todayIso()
  // Lecture indicative de l’échéancier : l’encaissé validé couvre les échéances dans l’ordre
  const paidMinor = toMinor(fin?.paid ?? 0)
  const amounts = (items ?? []).map((i) => toMinor(i.amount))
  const rows = (items ?? []).map((i, idx) => {
    const amt = amounts[idx]!
    const before = amounts.slice(0, idx).reduce((a, b) => a + b, 0)
    const covered = Math.min(Math.max(paidMinor - before, 0), amt)
    const state = covered >= amt ? 'paid' : i.due_date && i.due_date < today ? 'late' : covered > 0 ? 'partial' : 'upcoming'
    return { ...i, covered: covered / 1000, state }
  })

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Prix de vente net" value={<Money value={total} />} />
        <Tile label="Encaissé (validé)" value={<Money value={fin?.paid ?? 0} />} />
        <Tile label="Solde client" value={<Money value={fin?.balance} />} />
        <Tile label="Échu non payé" value={<Money value={fin?.overdue ?? 0} className={Number(fin?.overdue) > 0 ? 'text-danger-700' : ''} />} />
      </div>
      {items?.length && Math.abs(scheduled - total) > 0.0005 ? (
        <Alert tone="warning">L’échéancier ({scheduled.toFixed(3)} DT) ne correspond pas au prix de vente net ({total.toFixed(3)} DT).</Alert>
      ) : null}

      <Card>
        <CardHeader title="Échéancier client" description="Acomptes et tranches librement paramétrés pour ce dossier. Un solde futur prévu à l’échéancier ne bloque pas le départ." />
        <CardBody>
          {rows.length ? (
            <Table className="-mx-5">
              <thead><tr><Th>Échéance</Th><Th>Nature</Th><Th>Date</Th><Th className="text-right">Montant</Th><Th>Situation</Th>{canEdit ? <Th /> : null}</tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    {canEdit ? (
                      <Td colSpan={4}>
                        <OpsForm action={saveScheduleItem} inline>
                          <input type="hidden" name="id" value={i.id} /><input type="hidden" name="dossier_id" value={id} />
                          <div className="grid gap-2 sm:grid-cols-[1fr_9rem_10rem_9rem_auto]">
                            <Input name="label" defaultValue={i.label} aria-label="Libellé" className="h-8! text-sm!" />
                            <Select name="kind" defaultValue={i.kind} aria-label="Nature" className="h-8! text-sm!">{Object.entries(scheduleKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                            <Input name="due_date" type="date" defaultValue={i.due_date ?? ''} aria-label="Date" className="h-8! text-sm!" />
                            <Input name="amount" type="number" step="0.001" min={0.001} defaultValue={i.amount} aria-label="Montant" className="h-8! text-right text-sm!" />
                            <span className="flex gap-1">
                              <OpsSubmit size="sm" variant="ghost">OK</OpsSubmit>
                              <OpsSubmit size="sm" variant="ghost" name="remove" value="1" confirm="Supprimer cette échéance ?">Suppr.</OpsSubmit>
                            </span>
                          </div>
                        </OpsForm>
                      </Td>
                    ) : (
                      <>
                        <Td>{i.label}</Td><Td>{label(scheduleKindLabels, i.kind)}</Td><Td>{formatDateFr(i.due_date)}</Td><Td className="text-right"><Money value={i.amount} /></Td>
                      </>
                    )}
                    <Td>
                      {i.state === 'paid' ? <Badge tone="success">Couverte</Badge> : i.state === 'late' ? <Badge tone="danger">En retard{i.covered ? ` (${i.covered.toFixed(3)} reçus)` : ''}</Badge> : i.state === 'partial' ? <Badge tone="warning">Partielle</Badge> : <Badge>À venir</Badge>}
                    </Td>
                    {canEdit ? <Td /> : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="Aucune échéance" description="L’échéancier convenu au devis est repris automatiquement à l’acceptation." />}
          {canEdit ? (
            <OpsForm action={saveScheduleItem} resetOnSuccess className="mt-4">
              <input type="hidden" name="dossier_id" value={id} />
              <p className="text-sm font-medium">Ajouter une échéance</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_9rem_10rem_9rem_auto]">
                <Input name="label" placeholder="Libellé (ex. Tranche 3)" aria-label="Libellé" />
                <Select name="kind" defaultValue="installment" aria-label="Nature">{Object.entries(scheduleKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <Input name="due_date" type="date" aria-label="Date" />
                <Input name="amount" type="number" step="0.001" min={0.001} placeholder="Montant" aria-label="Montant" />
                <OpsSubmit variant="secondary">Ajouter</OpsSubmit>
              </div>
            </OpsForm>
          ) : null}
        </CardBody>
      </Card>

      {canFinance ? (
        <Card>
          <CardHeader title="Règlements affectés" description="Saisie et validation par la finance."
            actions={
              <>
                {session.can('finance', 'create') ? <Link href={`/finances/reglements/nouveau?dossier=${id}`} className={buttonClass('accent', 'sm')}>Enregistrer un règlement</Link> : null}
                {session.can('finance', 'create') ? <Link href={`/finances/factures/nouvelle?dossier=${id}`} className={buttonClass('secondary', 'sm')}>Créer une facture</Link> : null}
              </>
            } />
          <CardBody>
            {allocations.data?.length ? (
              <Table className="-mx-5">
                <thead><tr><Th>Règlement</Th><Th>Mode</Th><Th>Reçu le</Th><Th>Statut</Th><Th className="text-right">Affecté au dossier</Th></tr></thead>
                <tbody>
                  {allocations.data.map((a) => {
                    const p = a.payments as { reference: string; method: string; status: string; received_at: string; direction: string; kind: string; external_ref: string | null } | null
                    return (
                      <tr key={a.id}>
                        <Td className="font-medium">{p?.reference}{p?.kind !== 'payment' ? <Badge tone="warning" className="ml-1">{p?.kind === 'refund' ? 'Remboursement' : 'Contre-écriture'}</Badge> : null}<p className="text-xs text-muted">{p?.external_ref}</p></Td>
                        <Td>{label(paymentMethodLabels, p?.method)}</Td>
                        <Td>{formatDateFr(p?.received_at)}</Td>
                        <Td><StatusBadge status={p?.status} labels={paymentStatusLabels} /></Td>
                        <Td className="text-right"><Money value={p?.direction === 'out' ? -Number(a.amount) : a.amount} /></Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            ) : <EmptyState title="Aucun règlement affecté" />}
            {invoices.data?.length ? (
              <div className="mt-4">
                <p className="mb-1 text-sm font-medium">Factures et avoirs</p>
                <ul className="space-y-1 text-sm">
                  {invoices.data.map((i) => <li key={i.id} className="flex flex-wrap justify-between gap-2"><span>{label(invoiceKindLabels, i.kind)} {i.number ?? '(brouillon)'} — {formatDateFr(i.issue_date)}</span><span className="flex items-center gap-2"><StatusBadge status={i.status} labels={invoiceStatusLabels} /><Money value={i.total_ttc} /></span></li>)}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : <Alert tone="info">Le détail des règlements est réservé aux profils finance.</Alert>}
    </div>
  )
}

function Tile({ label: l, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-card border border-line bg-surface p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 font-display text-xl font-semibold text-brand-900">{value}</p></div>
}
