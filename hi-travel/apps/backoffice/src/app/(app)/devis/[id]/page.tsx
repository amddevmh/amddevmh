import Link from 'next/link'
import { notFound } from 'next/navigation'
import { activityLabels, formatDateFr, formatDateTimeFr, formatMoney, label, quoteStatusLabels } from '@hi/core'
import { Alert, Card, CardBody, CardHeader, Field, Input, Select, StatusBadge, buttonClass, cn } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { QuoteVersionEditor } from '@/components/ops/quote-editor'
import { requireStaff } from '@/lib/auth'
import { acceptQuoteVersion, newQuoteVersion, rejectQuote, sendQuoteVersion } from '@/lib/ops/actions/quotes'
import { db, getStaff, getSupplierOptions, sp, type SearchParams } from '@/lib/ops/data'
import type { PaymentTermPayload, QuoteVersionPayload } from '@/lib/ops/types'

export const metadata = { title: 'Devis' }

function toTerms(raw: unknown): PaymentTermPayload[] {
  if (!Array.isArray(raw)) return []
  return raw.map((t: Record<string, unknown>) => ({
    label: String(t.label ?? ''),
    kind: (['deposit', 'installment', 'balance'].includes(String(t.kind)) ? t.kind : 'installment') as PaymentTermPayload['kind'],
    mode: t.amount != null ? 'amount' : 'percent',
    value: Number(t.amount ?? t.percent ?? 0),
    due: t.due_date ? 'date' : 'days',
    due_date: t.due_date ? String(t.due_date) : '',
    days_before_departure: t.days_before_departure != null ? Number(t.days_before_departure) : 0,
  }))
}

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requireStaff('quotes')
  const { id } = await params
  const sparams = await searchParams
  const supabase = await db()
  const { data: quote } = await supabase.from('quotes').select('*, clients(id, display_name, email), leads(id, reference)').eq('id', id).maybeSingle()
  if (!quote) notFound()
  const [{ data: versions }, suppliers, staff, { data: dossier }] = await Promise.all([
    supabase.from('quote_versions').select('*').eq('quote_id', id).order('version_no'),
    getSupplierOptions(),
    getStaff(),
    supabase.from('dossiers').select('id, reference').eq('quote_id', id).maybeSingle(),
  ])
  const all = versions ?? []
  const current = all.find((v) => v.id === sp(sparams, 'v')) ?? all.at(-1)
  if (!current) notFound()
  const [{ data: lines }, { data: totals }] = await Promise.all([
    supabase.from('quote_lines').select('*').eq('version_id', current.id).order('position'),
    supabase.from('quote_version_totals').select('*').in('version_id', all.map((v) => v.id)),
  ])
  const totalMap = new Map((totals ?? []).map((t) => [t.version_id, t]))
  const canMargins = session.can('margins')
  const canUpdate = session.can('quotes', 'update')
  const accepted = quote.status === 'accepted'
  const editable = current.status === 'draft' && canUpdate && !accepted
  const client = quote.clients as { id: string; display_name: string | null } | null
  const lead = quote.leads as { id: string; reference: string } | null
  const owner = staff.find((s) => s.id === quote.owner_id)?.full_name

  const initial: QuoteVersionPayload = {
    version_id: current.id, label: current.label ?? '', language: current.language as 'fr' | 'en',
    start_date: current.start_date, end_date: current.end_date, adults: current.adults, children: current.children, infants: current.infants,
    currency: current.currency, valid_until: current.valid_until, inclusions: current.inclusions, exclusions: current.exclusions,
    client_notes: current.client_notes ?? '', internal_notes: current.internal_notes ?? '',
    program: (Array.isArray(current.program) ? current.program : []).map((p) => {
      const o = (p ?? {}) as Record<string, unknown>
      return { day: Number(o.day ?? 1), title: String(o.title ?? ''), description: String(o.description ?? '') }
    }),
    terms: toTerms(current.payment_terms),
    lines: (lines ?? []).map((l) => {
      const d = (l.details ?? {}) as Record<string, unknown>
      return {
        id: l.id, activity: l.activity, service_type: l.service_type, description: l.description, supplier_id: l.supplier_id,
        start_date: l.start_date, end_date: l.end_date, pax_type: l.pax_type, quantity: Number(l.quantity), unit_price: Number(l.unit_price),
        // Coûts internes jamais transmis au navigateur sans le droit « marges »
        unit_cost: canMargins ? Number(l.unit_cost) : 0, cost_currency: canMargins ? l.cost_currency : 'TND', fx_rate: canMargins ? Number(l.fx_rate) : 1,
        is_optional: l.is_optional, option_selected: l.option_selected, is_mandatory: l.is_mandatory,
        room_type: d.room_type ? String(d.room_type) : '', board: d.board ? String(d.board) : '',
      }
    }),
  }
  const saved = totalMap.get(current.id)

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{quote.reference} <StatusBadge status={quote.status} labels={quoteStatusLabels} /></span>}
        description={<>{quote.title} — {client ? <Link className="text-brand-600 hover:underline" href={`/crm/clients/${client.id}`}>{client.display_name}</Link> : null} — {label(activityLabels, quote.activity)}{owner ? ` — suivi par ${owner}` : ''}{lead ? <> — demande <Link className="text-brand-600 hover:underline" href={`/crm/demandes/${lead.id}`}>{lead.reference}</Link></> : null}</>}
        breadcrumbs={[{ href: '/devis', label: 'Devis' }]}
        actions={
          <>
            <Link href={`/devis/${quote.id}/imprimer?v=${current.id}`} className={buttonClass('secondary', 'sm')} target="_blank">Version imprimable</Link>
            {dossier ? <Link href={`/dossiers/${dossier.id}`} className={buttonClass('accent', 'sm')}>Ouvrir le dossier {dossier.reference}</Link> : null}
          </>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Versions">
        {all.map((v) => (
          <Link key={v.id} href={`/devis/${quote.id}?v=${v.id}`}
            className={cn('rounded-lg border px-3 py-1.5 text-sm', v.id === current.id ? 'border-brand-500 bg-brand-50 font-semibold text-brand-900' : 'border-line bg-white hover:border-brand-300')}>
            v{v.version_no}{v.label ? ` · ${v.label}` : ''} — {label(quoteStatusLabels, v.status)} — {formatMoney(totalMap.get(v.id)?.total_price ?? 0, v.currency)}
          </Link>
        ))}
      </nav>

      {quote.status === 'rejected' && quote.lost_reason ? <Alert tone="danger" title="Devis refusé" className="mb-4">{quote.lost_reason}</Alert> : null}

      <div className="grid gap-6 2xl:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader
            title={`Version ${current.version_no}`}
            description={<>
              {label(quoteStatusLabels, current.status)}
              {current.sent_at ? ` — envoyée le ${formatDateTimeFr(current.sent_at)}${current.sent_via ? ` (${current.sent_via})` : ''}` : ''}
              {current.responded_at ? ` — réponse le ${formatDateTimeFr(current.responded_at)}${current.response_note ? ` : ${current.response_note}` : ''}` : ''}
            </>}
          />
          <CardBody>
            <QuoteVersionEditor initial={initial} suppliers={suppliers} canMargins={canMargins} readOnly={!editable} defaultActivity={quote.activity} />
            {saved ? (
              <p className="mt-3 text-xs text-muted">
                Total enregistré (vue de contrôle) : {formatMoney(saved.total_price, current.currency)}
                {canMargins ? ` — coût ${formatMoney(saved.total_cost_tnd)}` : ''} — options non retenues {formatMoney(saved.optional_total, current.currency)}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="order-first grid content-start gap-4 md:grid-cols-2 2xl:order-none 2xl:grid-cols-1">
          {current.status === 'draft' && canUpdate && !accepted ? (
            <Card>
              <CardHeader title="Envoyer au client" description="Enregistre l’envoi ; la version devient figée." />
              <CardBody>
                <OpsForm action={sendQuoteVersion}>
                  <input type="hidden" name="version_id" value={current.id} />
                  <Field label="Canal" htmlFor="via">
                    <Select id="via" name="via" defaultValue="email"><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="hand">Remis en main propre</option><option value="phone">Téléphone</option></Select>
                  </Field>
                  <OpsSubmit confirm="Enregistrer l’envoi ? La version ne pourra plus être modifiée.">Marquer comme envoyée</OpsSubmit>
                </OpsForm>
              </CardBody>
            </Card>
          ) : null}

          {['draft', 'sent'].includes(current.status) && session.can('quotes', 'validate') && !accepted ? (
            <Card>
              <CardHeader title="Acceptation du client" description="Crée le dossier avec les prestations, voyageurs et l’échéancier de cette version." />
              <CardBody>
                <OpsForm action={acceptQuoteVersion}>
                  <input type="hidden" name="version_id" value={current.id} />
                  <Field label="Note d’acceptation" htmlFor="note"><Input id="note" name="note" placeholder="Ex. Accord écrit par e-mail du 03/10" /></Field>
                  <OpsSubmit variant="accent" confirm={`Confirmer l’acceptation de la version ${current.version_no} ? Un dossier va être créé.`}>Accepter et créer le dossier</OpsSubmit>
                </OpsForm>
              </CardBody>
            </Card>
          ) : null}

          {canUpdate && !accepted ? (
            <Card>
              <CardHeader title="Nouvelle version" description="Copie de cette version, modifiable (variante ou modification demandée)." />
              <CardBody>
                <OpsForm action={newQuoteVersion}>
                  <input type="hidden" name="quote_id" value={quote.id} />
                  <input type="hidden" name="from_version_id" value={current.id} />
                  <OpsSubmit variant="secondary">Créer la version {all.length + 1}</OpsSubmit>
                </OpsForm>
              </CardBody>
            </Card>
          ) : null}

          {['draft', 'sent'].includes(current.status) && canUpdate && !accepted ? (
            <Card>
              <CardHeader title="Refus / devis perdu" />
              <CardBody>
                <OpsForm action={rejectQuote}>
                  <input type="hidden" name="quote_id" value={quote.id} />
                  <input type="hidden" name="version_id" value={current.id} />
                  <Field label="Motif" htmlFor="reason" required><Input id="reason" name="reason" placeholder="Ex. prix, dates, concurrent…" /></Field>
                  {lead ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="lead_lost" defaultChecked className="size-4" /> Marquer la demande comme perdue</label> : null}
                  <OpsSubmit variant="danger" confirm="Enregistrer le refus du client ?">Enregistrer le refus</OpsSubmit>
                </OpsForm>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Repères" />
            <CardBody className="space-y-1 text-sm">
              <p>Validité : {formatDateFr(current.valid_until)}</p>
              <p>Voyage : {formatDateFr(current.start_date)} → {formatDateFr(current.end_date)}</p>
              <p>Voyageurs : {current.adults} ad. · {current.children} enf. · {current.infants} bébé(s)</p>
              <p>Créé le {formatDateFr(quote.created_at)}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
