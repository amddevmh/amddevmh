/* eslint-disable @next/next/no-img-element -- document imprimable : image statique simple */
import { notFound } from 'next/navigation'
import { addDays, computeQuoteTotals, formatMoney, type PaxType } from '@hi/core'
import { PrintButton } from '@/components/ops/print-button'
import { requireStaff } from '@/lib/auth'
import { db, sp, type SearchParams } from '@/lib/ops/data'

export const metadata = { title: 'Devis imprimable' }

const T = {
  fr: {
    quote: 'Devis', version: 'version', date: 'Date', client: 'Client', trip: 'Voyage', from: 'du', to: 'au', travellers: 'Voyageurs',
    adults: 'adulte(s)', children: 'enfant(s)', infants: 'bébé(s)', program: 'Programme', day: 'Jour', services: 'Prestations',
    description: 'Désignation', dates: 'Dates', pax: 'Voyageurs', qty: 'Qté', unit: 'Prix unitaire', amount: 'Montant',
    total: 'Total', options: 'Options proposées (non incluses dans le total)', included: 'Inclus', excluded: 'Non inclus',
    terms: 'Modalités de paiement', due: 'Échéance', validity: 'Devis valable jusqu’au', notes: 'Conditions', option: 'option retenue',
    paxType: { adult: 'Adulte', child: 'Enfant', infant: 'Bébé', all: 'Tous' } as Record<string, string>,
    beforeDeparture: (n: number) => `${n} jour(s) avant le départ`, print: 'Imprimer / enregistrer en PDF',
    footer: 'Prix exprimés en dinars tunisiens (DT) sauf mention contraire. Document non contractuel tant que non accepté par écrit.',
  },
  en: {
    quote: 'Quotation', version: 'version', date: 'Date', client: 'Client', trip: 'Trip', from: 'from', to: 'to', travellers: 'Travellers',
    adults: 'adult(s)', children: 'child(ren)', infants: 'infant(s)', program: 'Itinerary', day: 'Day', services: 'Services',
    description: 'Description', dates: 'Dates', pax: 'Travellers', qty: 'Qty', unit: 'Unit price', amount: 'Amount',
    total: 'Total', options: 'Optional services (not included in the total)', included: 'Included', excluded: 'Not included',
    terms: 'Payment terms', due: 'Due', validity: 'Quotation valid until', notes: 'Terms and conditions', option: 'selected option',
    paxType: { adult: 'Adult', child: 'Child', infant: 'Infant', all: 'All' } as Record<string, string>,
    beforeDeparture: (n: number) => `${n} day(s) before departure`, print: 'Print / save as PDF',
    footer: 'Prices in Tunisian dinars (TND) unless stated otherwise. Not binding until accepted in writing.',
  },
}

export default async function QuotePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await requireStaff('quotes')
  const { id } = await params
  const sparams = await searchParams
  const supabase = await db()
  const { data: quote } = await supabase.from('quotes').select('id, reference, title, clients(display_name, email, phone, address, city)').eq('id', id).maybeSingle()
  if (!quote) notFound()
  const { data: versions } = await supabase.from('quote_versions').select('*').eq('quote_id', id).order('version_no')
  const v = (versions ?? []).find((x) => x.id === sp(sparams, 'v')) ?? (versions ?? []).at(-1)
  if (!v) notFound()
  // Colonnes client uniquement : aucun coût ni taux de change n’est lu pour ce document
  const [{ data: lines }, { data: agency }] = await Promise.all([
    supabase.from('quote_lines').select('id, description, start_date, end_date, pax_type, quantity, unit_price, is_optional, option_selected').eq('version_id', v.id).order('position'),
    supabase.from('app_settings').select('value').eq('key', 'agency').maybeSingle(),
  ])
  const t = T[v.language === 'en' ? 'en' : 'fr']
  const locale = v.language === 'en' ? 'en-GB' : 'fr-FR'
  const fmtDate = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)) : '—')
  const money = (n: number) => formatMoney(n, v.currency)
  const a = (agency?.value ?? {}) as Record<string, string>
  const client = quote.clients as { display_name?: string; email?: string; phone?: string; address?: string; city?: string } | null
  const all = lines ?? []
  const included = all.filter((l) => !l.is_optional || l.option_selected)
  const optional = all.filter((l) => l.is_optional && !l.option_selected)
  const totals = computeQuoteTotals(all.map((l) => ({ paxType: l.pax_type as PaxType, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), unitCost: 0, isOptional: l.is_optional, optionSelected: l.option_selected })))
  const terms = (Array.isArray(v.payment_terms) ? v.payment_terms : []) as Array<Record<string, unknown>>
  const program = (Array.isArray(v.program) ? v.program : []) as Array<Record<string, unknown>>

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #quote-print, #quote-print * { visibility: visible !important; }
          #quote-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Document client : prix de vente uniquement, sans coûts ni marges. Langue : {v.language === 'en' ? 'anglais' : 'français'}.</p>
        <PrintButton label={t.print} />
      </div>
      <article id="quote-print" className="mx-auto max-w-[210mm] rounded-card border border-line bg-white p-10 text-[13px] leading-relaxed text-ink shadow-sm">
        <header className="flex items-start justify-between gap-6 border-b-4 border-accent-400 pb-5">
          <div>
            <img src="/hi-travel-logo.png" alt="HI Travel" width={150} height={44} />
            <p className="mt-2 text-xs text-muted">{a.address}</p>
            <p className="text-xs text-muted">{a.phone} · {a.email}</p>
          </div>
          <div className="text-right">
            <h1 className="font-display text-2xl font-semibold text-brand-900">{t.quote}</h1>
            <p className="font-medium">{quote.reference} — {t.version} {v.version_no}</p>
            <p className="text-xs text-muted">{t.date} : {fmtDate((v.sent_at ?? v.created_at).slice(0, 10))}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">{t.client}</p>
            <p className="font-medium">{client?.display_name}</p>
            <p className="text-xs text-muted">{[client?.address, client?.city].filter(Boolean).join(', ')}</p>
            <p className="text-xs text-muted">{[client?.email, client?.phone].filter(Boolean).join(' · ')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">{t.trip}</p>
            <p className="font-medium">{quote.title}</p>
            <p className="text-xs">{t.from} {fmtDate(v.start_date)} {t.to} {fmtDate(v.end_date)}</p>
            <p className="text-xs">{t.travellers} : {v.adults} {t.adults}{v.children ? `, ${v.children} ${t.children}` : ''}{v.infants ? `, ${v.infants} ${t.infants}` : ''}</p>
          </div>
        </section>

        {program.length ? (
          <section className="mt-6">
            <h2 className="mb-2 font-display text-base font-semibold text-brand-900">{t.program}</h2>
            <ol className="space-y-1.5">
              {program.map((p, i) => (
                <li key={i}><span className="font-semibold">{t.day} {String(p.day ?? i + 1)} — {String(p.title ?? '')}</span>{p.description ? <span className="text-muted"> : {String(p.description)}</span> : null}</li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="mb-2 font-display text-base font-semibold text-brand-900">{t.services}</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-brand-900 text-left text-white">
                <th className="px-2 py-1.5">{t.description}</th><th className="px-2 py-1.5">{t.dates}</th><th className="px-2 py-1.5">{t.pax}</th>
                <th className="px-2 py-1.5 text-right">{t.qty}</th><th className="px-2 py-1.5 text-right">{t.unit}</th><th className="px-2 py-1.5 text-right">{t.amount}</th>
              </tr>
            </thead>
            <tbody>
              {included.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="px-2 py-1.5">{l.description}{l.is_optional ? <em className="text-muted"> ({t.option})</em> : null}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{l.start_date ? `${fmtDate(l.start_date)}${l.end_date && l.end_date !== l.start_date ? ` → ${fmtDate(l.end_date)}` : ''}` : '—'}</td>
                  <td className="px-2 py-1.5">{t.paxType[l.pax_type]}</td>
                  <td className="px-2 py-1.5 text-right tabular">{Number(l.quantity)}</td>
                  <td className="px-2 py-1.5 text-right tabular whitespace-nowrap">{money(Number(l.unit_price))}</td>
                  <td className="px-2 py-1.5 text-right tabular whitespace-nowrap">{money(Math.round(Number(l.unit_price) * Number(l.quantity) * 1000) / 1000)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-2 py-2 text-right font-semibold">{t.total}</td>
                <td className="px-2 py-2 text-right font-display text-base font-semibold text-brand-900 tabular whitespace-nowrap">{money(totals.totalPrice)}</td>
              </tr>
            </tfoot>
          </table>
          {optional.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold">{t.options}</p>
              <ul className="text-xs">
                {optional.map((l) => <li key={l.id}>{l.description} — {Number(l.quantity)} × {money(Number(l.unit_price))}</li>)}
              </ul>
            </div>
          ) : null}
        </section>

        {v.inclusions.length || v.exclusions.length ? (
          <section className="mt-6 grid grid-cols-2 gap-6">
            <div>
              <h2 className="mb-1 font-display text-sm font-semibold text-brand-900">{t.included}</h2>
              <ul className="list-disc pl-5 text-xs">{v.inclusions.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <h2 className="mb-1 font-display text-sm font-semibold text-brand-900">{t.excluded}</h2>
              <ul className="list-disc pl-5 text-xs">{v.exclusions.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </section>
        ) : null}

        {terms.length ? (
          <section className="mt-6">
            <h2 className="mb-1 font-display text-sm font-semibold text-brand-900">{t.terms}</h2>
            <ul className="text-xs">
              {terms.map((term, i) => {
                const amount = term.amount != null ? Number(term.amount) : Math.round(totals.totalPrice * Number(term.percent ?? 0) * 10) / 1000
                const due = term.due_date ? fmtDate(String(term.due_date))
                  : v.start_date ? `${fmtDate(addDays(v.start_date, -Number(term.days_before_departure ?? 0)))} (${t.beforeDeparture(Number(term.days_before_departure ?? 0))})`
                    : t.beforeDeparture(Number(term.days_before_departure ?? 0))
                return (
                  <li key={i} className="flex justify-between border-b border-line py-1">
                    <span>{String(term.label ?? '')}{term.percent != null ? ` (${Number(term.percent)} %)` : ''} — {t.due} : {due}</span>
                    <span className="tabular">{money(amount)}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {v.client_notes ? (
          <section className="mt-6">
            <h2 className="mb-1 font-display text-sm font-semibold text-brand-900">{t.notes}</h2>
            <p className="whitespace-pre-line text-xs">{v.client_notes}</p>
          </section>
        ) : null}

        <footer className="mt-8 border-t border-line pt-3 text-xs text-muted">
          <p className="font-semibold text-brand-900">{t.validity} {fmtDate(v.valid_until)}</p>
          <p>{t.footer}</p>
          <p>{a.name ?? 'HI Travel'} — {a.phone} — {a.email}</p>
        </footer>
      </article>
    </div>
  )
}
