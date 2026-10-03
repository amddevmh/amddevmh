import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import {
  documentKindLabels, dossierStatusLabels, formatDateFr, formatMoney, invoiceKindLabels, paymentMethodLabels,
} from '@hi/core'
import { Badge, StatusBadge, buttonClass, cn } from '@hi/ui'
import { Icon } from '@/components/icons'
import { ChangeRequestForm, UploadForm } from '@/components/portal-forms'
import { PortalShell } from '@/components/portal-shell'
import { todayTunis } from '@/lib/forms'
import { t } from '@/lib/i18n'
import { getPortalSession, scheduleWithStatus, type PortalDossier } from '@/lib/portal'

export const metadata: Metadata = { title: t.portal.dossier, robots: { index: false } }

type Props = { params: Promise<{ id: string }> }

function Card({ title, id, children, action, className }: { title: string; id: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('rounded-card border border-line bg-white shadow-sm', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id={id} className="text-lg font-semibold text-brand-900">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

const VOUCHER_KINDS = new Set(['voucher', 'ticket'])

export default async function DossierPage({ params }: Props) {
  const { id } = await params
  if (!z.guid().safeParse(id).success) notFound()
  const { supabase, email } = await getPortalSession(`/espace-client/dossiers/${id}`)
  const p = t.portal

  // RLS : un client ne lit que ses propres dossiers (un autre identifiant renvoie « introuvable »)
  const { data: dossierRow } = await supabase
    .from('portal_dossiers')
    .select('id, reference, title, destination, activity, start_date, end_date, status, total_price, currency, adults, children, infants, departure_id')
    .eq('id', id)
    .maybeSingle()
  const dossier = dossierRow as PortalDossier | null
  if (!dossier) notFound()

  const [balanceRes, summaryRes, scheduleRes, docsRes, invoicesRes, intentsRes, optionsRes] = await Promise.all([
    supabase.from('portal_dossier_balances').select('paid, balance, credit_notes').eq('dossier_id', id).maybeSingle(),
    supabase.rpc('portal_dossier_service_summary', { p_dossier_id: id }),
    supabase.from('payment_schedule_items').select('id, seq, label, kind, amount, due_date').eq('dossier_id', id).order('seq'),
    supabase.from('documents').select('id, kind, title, mime_type, size_bytes, created_at, uploaded_via').eq('dossier_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id, kind, number, issue_date, total_ttc, currency').eq('dossier_id', id).eq('status', 'validated').order('issue_date'),
    supabase.from('payment_intents').select('id, amount, currency, status, created_at').eq('dossier_id', id).order('created_at', { ascending: false }).limit(5),
    supabase.rpc('portal_payment_options'),
  ])
  // Règlements via la vue client (sans clé d'idempotence ni notes internes)
  const { data: allocations } = await supabase
    .from('portal_payments')
    .select('id, reference, received_at, method, allocated')
    .eq('dossier_id', id)
    .order('received_at')

  // Programme : offre publique associée au départ, si elle est publiée
  let program: Array<{ day: number; title: string; description?: string }> = []
  if (dossier.departure_id) {
    const { data: dep } = await supabase.from('site_departures').select('offer_id').eq('id', dossier.departure_id).maybeSingle()
    if (dep?.offer_id) {
      const { data: offer } = await supabase.from('site_offers').select('program').eq('id', dep.offer_id).maybeSingle()
      program = Array.isArray(offer?.program) ? (offer.program as typeof program) : []
    }
  }

  const balance = Number(balanceRes.data?.balance ?? 0)
  const paid = Number(balanceRes.data?.paid ?? 0)
  const summary = summaryRes.data?.[0]
  const schedule = scheduleWithStatus((scheduleRes.data ?? []).map((s) => ({ ...s, amount: Number(s.amount) })), paid, todayTunis())
  const docs = docsRes.data ?? []
  const vouchers = docs.filter((d) => VOUCHER_KINDS.has(d.kind))
  const otherDocs = docs.filter((d) => !VOUCHER_KINDS.has(d.kind))
  const options = (optionsRes.data ?? {}) as { enabled?: boolean; manual_instructions?: string }
  const payable = balance > 0 && !['cancelled', 'archived', 'request', 'quote_prepared', 'quote_sent'].includes(dossier.status)
  const paymentState = balance <= 0 ? p.paidFull : paid > 0 ? p.paidPartial : p.paidNone
  const programDoc = docs.find((d) => d.kind === 'program')

  const payButton = payable && options.enabled ? (
    <Link href={`/espace-client/dossiers/${id}/paiement`} className={buttonClass('accent', 'lg')}>
      <Icon name="card" className="size-5" /> {p.pay}
    </Link>
  ) : null

  return (
    <PortalShell
      email={email}
      crumbs={[{ href: '/espace-client', label: p.title }, { label: dossier.reference }]}
      title={<>{dossier.title} <span className="block text-base font-normal text-muted">{p.dossier} {dossier.reference}</span></>}
      actions={payButton}
    >
      {/* Trois statuts distincts : commercial, confirmation des prestations, paiement (FO06) */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{p.commercialStatus}</p>
          <div className="mt-2"><StatusBadge status={dossier.status} labels={dossierStatusLabels} className="text-sm" /></div>
          <p className="mt-3 text-sm text-muted">{formatDateFr(dossier.start_date)} → {formatDateFr(dossier.end_date)}</p>
          <p className="text-sm text-muted">{p.travellers} : {dossier.adults} adulte{dossier.adults > 1 ? 's' : ''}{dossier.children ? `, ${dossier.children} enfant${dossier.children > 1 ? 's' : ''}` : ''}{dossier.infants ? `, ${dossier.infants} bébé${dossier.infants > 1 ? 's' : ''}` : ''}</p>
        </div>
        <div className="rounded-card border border-line bg-white p-5" data-testid="services-status">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{p.servicesStatus}</p>
          {summary && summary.total > 0 ? (
            <>
              <p className="mt-2 font-display text-lg font-semibold text-brand-900">{p.servicesSummary(summary.confirmed, summary.total - summary.cancelled)}</p>
              {summary.on_option + summary.requested > 0 ? <p className="mt-1 text-sm text-muted">{p.servicesDetail(summary.on_option, summary.requested)}</p> : null}
            </>
          ) : <p className="mt-2 text-sm text-muted">{p.servicesNone}</p>}
        </div>
        <div className="rounded-card border border-line bg-white p-5" data-testid="payment-status">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{p.paymentStatus}</p>
          <p className="mt-2"><Badge tone={balance <= 0 ? 'success' : paid > 0 ? 'warning' : 'neutral'} className="text-sm">{paymentState}</Badge></p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-xs text-muted">{p.total}</dt><dd className="font-medium tabular">{formatMoney(dossier.total_price, dossier.currency)}</dd></div>
            <div><dt className="text-xs text-muted">{p.paid}</dt><dd className="font-medium tabular">{formatMoney(paid, dossier.currency)}</dd></div>
            <div><dt className="text-xs text-muted">{p.balance}</dt><dd className="font-semibold text-brand-700 tabular" data-testid="balance">{formatMoney(balance, dossier.currency)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-6">
          <Card title={p.schedule} id="schedule">
            {schedule.length === 0 ? <p className="text-sm text-muted">{p.noSchedule}</p> : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr><th scope="col" className="py-2 pr-3">{p.dueDate}</th><th scope="col" className="py-2 pr-3">Libellé</th><th scope="col" className="py-2 pr-3 text-right">{p.amount}</th><th scope="col" className="py-2">{p.itemStatus}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {schedule.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-3 tabular">{formatDateFr(s.due_date)}</td>
                        <td className="py-2.5 pr-3">{s.label}</td>
                        <td className="py-2.5 pr-3 text-right tabular">{formatMoney(s.amount, dossier.currency)}</td>
                        <td className="py-2.5">
                          {s.state === 'paid' ? <Badge tone="success">{p.itemPaid}</Badge>
                            : s.state === 'partial' ? <Badge tone="warning">{p.itemPartial(formatMoney(s.rest, dossier.currency))}</Badge>
                            : s.state === 'overdue' ? <Badge tone="danger">{p.itemOverdue}</Badge>
                            : <Badge tone="neutral">{p.itemDue}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {payable && !options.enabled ? (
              <div className="mt-4 rounded-lg bg-warning-50 p-4 text-sm ring-1 ring-inset ring-warning-600/20" data-testid="manual-payment">
                <p className="font-semibold text-warning-600">{t.payment.disabledTitle}</p>
                <p className="mt-1">{t.payment.disabledText} {options.manual_instructions}</p>
              </div>
            ) : null}
          </Card>

          <Card title={p.payments} id="payments">
            {(allocations ?? []).length === 0 ? <p className="text-sm text-muted">{p.noPayments}</p> : (
              <ul className="divide-y divide-line text-sm">
                {(allocations ?? []).map((a, idx) => {
                  return (
                    <li key={`${a.id}-${idx}`} className="flex items-center justify-between gap-3 py-2.5">
                      <span>
                        <span className="font-medium">{formatDateFr(a.received_at)}</span>
                        <span className="text-muted"> · {a.method ? paymentMethodLabels[a.method] ?? a.method : ''} · {a.reference}</span>
                      </span>
                      <span className="font-semibold tabular">{formatMoney(a.allocated, dossier.currency)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            {(intentsRes.data ?? []).length > 0 ? (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="text-sm font-semibold text-brand-900">{p.onlinePayments}</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {(intentsRes.data ?? []).map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3">
                      <span className="text-muted">{formatDateFr(i.created_at)} · {formatMoney(i.amount, i.currency)}</span>
                      <StatusBadge status={i.status === 'succeeded' ? 'validated' : i.status === 'pending' || i.status === 'created' ? 'pending' : 'rejected'} labels={{ validated: p.intentStatus.succeeded!, pending: p.intentStatus.pending!, rejected: p.intentStatus[i.status] ?? i.status }} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card title={p.invoices} id="invoices">
            {(invoicesRes.data ?? []).length === 0 ? <p className="text-sm text-muted">{p.noInvoices}</p> : (
              <ul className="divide-y divide-line text-sm">
                {(invoicesRes.data ?? []).map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span><span className="font-medium">{invoiceKindLabels[inv.kind] ?? inv.kind} {inv.number}</span><span className="text-muted"> · {formatDateFr(inv.issue_date)}</span></span>
                    <span className="font-semibold tabular">{formatMoney(inv.total_ttc, inv.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={p.program} id="program">
            {program.length > 0 ? (
              <ol className="space-y-3">
                {program.map((d, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">J{d.day}</span>
                    <div><p className="font-medium text-brand-900">{d.title}</p>{d.description ? <p className="text-sm text-muted">{d.description}</p> : null}</div>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted">{programDoc ? p.programFromDocs : p.noProgram}</p>}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title={p.vouchers} id="vouchers">
            <DocList docs={vouchers} empty={p.noDocuments} />
          </Card>
          <Card title={p.documents} id="documents">
            <p className="mb-3 text-xs text-muted">{p.documentsIntro}</p>
            <DocList docs={otherDocs} empty={p.noDocuments} />
          </Card>
          <Card title={p.upload.title} id="upload">
            <UploadForm dossierId={dossier.id} />
          </Card>
          <Card title={p.change.title} id="change">
            <p className="mb-4 text-sm text-muted">{p.change.intro}</p>
            <ChangeRequestForm dossierId={dossier.id} />
          </Card>
        </div>
      </div>
    </PortalShell>
  )
}

function DocList({ docs, empty }: { docs: Array<{ id: string; kind: string; title: string; size_bytes: number; created_at: string; uploaded_via: string }>; empty: string }) {
  const p = t.portal
  if (docs.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line" data-testid="documents">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex min-w-0 items-start gap-2">
            <Icon name="file" className="mt-0.5 size-5 shrink-0 text-brand-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{d.title}</p>
              <p className="text-xs text-muted">
                {documentKindLabels[d.kind] ?? d.kind} · {formatDateFr(d.created_at)} · {Math.max(1, Math.round(d.size_bytes / 1024))} Ko · {d.uploaded_via === 'portal' ? p.uploadedByYou : p.published}
              </p>
            </div>
          </div>
          <a href={`/espace-client/documents/${d.id}`} className={buttonClass('ghost', 'sm', 'shrink-0')} data-testid="download">
            <Icon name="download" className="size-4" /><span className="sr-only">{p.download} {d.title}</span><span aria-hidden className="hidden sm:inline">{p.download}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
