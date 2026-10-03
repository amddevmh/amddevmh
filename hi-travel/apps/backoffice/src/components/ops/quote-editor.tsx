'use client'

import { startTransition, useActionState, useMemo, useState } from 'react'
import { ACTIVITIES, activityLabels, boardLabels, computeQuoteTotals, formatMoney, serviceTypeLabels, toMinor, type PaxType } from '@hi/core'
import { Alert, Badge, Button, Field, Input, Select, Textarea, cn } from '@hi/ui'
import { FormMessage } from '@/components/forms'
import type { ActionState } from '@/lib/actions'
import { saveQuoteVersion } from '@/lib/ops/actions/quotes'
import { QUOTE_SERVICE_TYPES, paxTypeLabels, scheduleKindLabels } from '@/lib/ops/labels'
import type { PaymentTermPayload, QuoteLinePayload, QuoteVersionPayload } from '@/lib/ops/types'

type Line = QuoteLinePayload & { key: string }
type Term = PaymentTermPayload & { key: string }

let seq = 0
function omitKey<T extends { key: string }>(o: T): Omit<T, 'key'> {
  const copy: Partial<T> = { ...o }
  delete copy.key
  return copy as Omit<T, 'key'>
}
/** Clés des éléments ajoutés côté navigateur (les éléments initiaux ont des clés déterministes : pas d’écart d’hydratation). */
const key = () => `n${++seq}`

const n = (v: string) => {
  const x = Number(v.replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

interface EditorProps {
  initial: QuoteVersionPayload
  suppliers: Array<{ id: string; name: string; currency: string }>
  canMargins: boolean
  readOnly: boolean
  defaultActivity: string
}

/**
 * Éditeur d’une version de devis. L’état d’envoi est conservé ici ; l’éditeur interne est
 * remonté lorsque le serveur renvoie de nouvelles lignes (identifiants créés).
 */
export function QuoteVersionEditor(props: EditorProps) {
  const [state, action, pending] = useActionState(saveQuoteVersion, { ok: false } as ActionState)
  const token = `${props.initial.version_id}:${props.initial.lines.map((l) => l.id).join(',')}:${props.readOnly}`
  return <EditorInner key={token} {...props} state={state} action={action} pending={pending} />
}

function EditorInner({ initial, suppliers, canMargins, readOnly, defaultActivity, state, action, pending }: EditorProps & {
  state: ActionState; action: (fd: FormData) => void; pending: boolean
}) {
  const [h, setH] = useState(() => ({ ...initial, inclusionsText: initial.inclusions.join('\n'), exclusionsText: initial.exclusions.join('\n') }))
  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l, i) => ({ ...l, key: `l${i}` })))
  const [terms, setTerms] = useState<Term[]>(() => initial.terms.map((t, i) => ({ ...t, key: `t${i}` })))
  const [program, setProgram] = useState(() => initial.program.map((p, i) => ({ ...p, key: `p${i}` })))
  const [dirty, setDirty] = useState(false)

  const totals = useMemo(() => computeQuoteTotals(lines.map((l) => ({
    paxType: l.pax_type as PaxType, quantity: l.quantity, unitPrice: l.unit_price, unitCost: l.unit_cost, fxRate: l.fx_rate,
    isOptional: l.is_optional, optionSelected: l.option_selected,
  }))), [lines])
  const termAmounts = terms.map((t) => (t.mode === 'amount' ? t.value : Math.round((toMinor(totals.totalPrice) * t.value) / 100) / 1000))
  const scheduled = Math.round(termAmounts.reduce((a, b) => a + toMinor(b), 0)) / 1000
  const balanced = Math.abs(scheduled - totals.totalPrice) < 0.0005

  const setHeader = (patch: Partial<typeof h>) => { setH((x) => ({ ...x, ...patch })); setDirty(true) }
  const setLine = (k: string, patch: Partial<Line>) => { setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l))); setDirty(true) }
  const setTerm = (k: string, patch: Partial<Term>) => { setTerms((ts) => ts.map((t) => (t.key === k ? { ...t, ...patch } : t))); setDirty(true) }
  const addLine = () => {
    setLines((ls) => [...ls, {
      key: key(), activity: defaultActivity, service_type: 'other', description: '', supplier_id: null, start_date: h.start_date, end_date: h.end_date,
      pax_type: 'all', quantity: 1, unit_cost: 0, cost_currency: 'TND', fx_rate: 1, unit_price: 0, is_optional: false, option_selected: false, is_mandatory: true,
    }])
    setDirty(true)
  }
  const move = (k: string, d: -1 | 1) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === k)
      const j = i + d
      if (j < 0 || j >= ls.length) return ls
      const copy = [...ls]
      ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
      return copy
    })
    setDirty(true)
  }

  const save = () => {
    const payload: QuoteVersionPayload = {
      version_id: initial.version_id, label: h.label, language: h.language, start_date: h.start_date || null, end_date: h.end_date || null,
      adults: h.adults, children: h.children, infants: h.infants, currency: h.currency, valid_until: h.valid_until || null,
      inclusions: h.inclusionsText.split('\n').map((s) => s.trim()).filter(Boolean),
      exclusions: h.exclusionsText.split('\n').map((s) => s.trim()).filter(Boolean),
      client_notes: h.client_notes, internal_notes: h.internal_notes,
      program: program.filter((p) => p.title.trim()).map(({ day, title, description }) => ({ day, title, description })),
      lines: lines.map((l) => ({ ...omitKey(l), start_date: l.start_date || null, end_date: l.end_date || null })),
      terms: terms.map((t) => omitKey(t)),
    }
    const fd = new FormData()
    fd.set('payload', JSON.stringify(payload))
    startTransition(() => { action(fd); setDirty(false) })
  }

  const ro = readOnly
  const sup = new Map(suppliers.map((s) => [s.id, s]))

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <section className="grid gap-4 md:grid-cols-4">
        <Field label="Libellé de la version" htmlFor="qv_label" className="md:col-span-2"><Input id="qv_label" value={h.label} onChange={(e) => setHeader({ label: e.target.value })} disabled={ro} placeholder="Ex. Variante hôtel 5*" /></Field>
        <Field label="Langue du document" htmlFor="qv_lang">
          <Select id="qv_lang" value={h.language} onChange={(e) => setHeader({ language: e.target.value as 'fr' | 'en' })} disabled={ro}><option value="fr">Français</option><option value="en">Anglais</option></Select>
        </Field>
        <Field label="Valable jusqu’au" htmlFor="qv_valid" required><Input id="qv_valid" type="date" value={h.valid_until ?? ''} onChange={(e) => setHeader({ valid_until: e.target.value })} disabled={ro} /></Field>
        <Field label="Départ" htmlFor="qv_start"><Input id="qv_start" type="date" value={h.start_date ?? ''} onChange={(e) => setHeader({ start_date: e.target.value })} disabled={ro} /></Field>
        <Field label="Retour" htmlFor="qv_end"><Input id="qv_end" type="date" value={h.end_date ?? ''} onChange={(e) => setHeader({ end_date: e.target.value })} disabled={ro} /></Field>
        <div className="grid grid-cols-3 gap-2 md:col-span-2">
          <Field label="Adultes" htmlFor="qv_ad"><Input id="qv_ad" type="number" min={0} value={h.adults} onChange={(e) => setHeader({ adults: Math.max(0, Math.trunc(n(e.target.value))) })} disabled={ro} /></Field>
          <Field label="Enfants" htmlFor="qv_ch"><Input id="qv_ch" type="number" min={0} value={h.children} onChange={(e) => setHeader({ children: Math.max(0, Math.trunc(n(e.target.value))) })} disabled={ro} /></Field>
          <Field label="Bébés" htmlFor="qv_inf"><Input id="qv_inf" type="number" min={0} value={h.infants} onChange={(e) => setHeader({ infants: Math.max(0, Math.trunc(n(e.target.value))) })} disabled={ro} /></Field>
        </div>
      </section>

      {/* Lignes */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-brand-900">Prestations ({lines.length})</h3>
          {!ro ? <Button type="button" variant="secondary" size="sm" onClick={addLine}>+ Ajouter une ligne</Button> : null}
        </div>
        {lines.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">Aucune ligne. Ajoutez les prestations (vol, hôtel, transfert…).</p> : null}
        <ol className="space-y-3">
          {lines.map((l, i) => {
            const included = !l.is_optional || l.option_selected
            const linePrice = Math.round(toMinor(l.unit_price * l.quantity)) / 1000
            const lineCost = Math.round(toMinor(l.unit_cost * l.fx_rate * l.quantity)) / 1000
            return (
              <li key={l.key} className={cn('rounded-lg border p-3', included ? 'border-line bg-white' : 'border-dashed border-line bg-canvas')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted">Ligne {i + 1}{l.is_optional ? <Badge tone={l.option_selected ? 'success' : 'neutral'} className="ml-2">{l.option_selected ? 'Option retenue' : 'Option non retenue'}</Badge> : null}</span>
                  <span className="text-sm font-semibold tabular">{formatMoney(linePrice, h.currency)}{canMargins ? <span className="ml-2 text-xs font-normal text-muted">coût {formatMoney(lineCost)} · marge {formatMoney(Math.round(toMinor(linePrice - lineCost)) / 1000)}</span> : null}</span>
                  {!ro ? (
                    <span className="flex gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => move(l.key, -1)} aria-label="Monter">↑</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => move(l.key, 1)} aria-label="Descendre">↓</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setLines((ls) => ls.filter((x) => x.key !== l.key)); setDirty(true) }}>Supprimer</Button>
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <Field label="Description" htmlFor={`d-${l.key}`} className="sm:col-span-2 lg:col-span-3"><Input id={`d-${l.key}`} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} disabled={ro} /></Field>
                  <Field label="Module" htmlFor={`a-${l.key}`}>
                    <Select id={`a-${l.key}`} value={l.activity} onChange={(e) => setLine(l.key, { activity: e.target.value })} disabled={ro}>{ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}</Select>
                  </Field>
                  <Field label="Type" htmlFor={`t-${l.key}`}>
                    <Select id={`t-${l.key}`} value={l.service_type} onChange={(e) => setLine(l.key, { service_type: e.target.value })} disabled={ro}>{QUOTE_SERVICE_TYPES.map((t) => <option key={t} value={t}>{serviceTypeLabels[t]}</option>)}</Select>
                  </Field>
                  <Field label="Fournisseur" htmlFor={`s-${l.key}`}>
                    <Select id={`s-${l.key}`} value={l.supplier_id ?? ''} onChange={(e) => {
                      const s = sup.get(e.target.value)
                      setLine(l.key, { supplier_id: e.target.value || null, ...(s && canMargins && l.unit_cost === 0 ? { cost_currency: s.currency } : {}) })
                    }} disabled={ro}>
                      <option value="">—</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Du" htmlFor={`sd-${l.key}`}><Input id={`sd-${l.key}`} type="date" value={l.start_date ?? ''} onChange={(e) => setLine(l.key, { start_date: e.target.value })} disabled={ro} /></Field>
                  <Field label="Au" htmlFor={`ed-${l.key}`}><Input id={`ed-${l.key}`} type="date" value={l.end_date ?? ''} onChange={(e) => setLine(l.key, { end_date: e.target.value })} disabled={ro} /></Field>
                  <Field label="Voyageurs" htmlFor={`p-${l.key}`}>
                    <Select id={`p-${l.key}`} value={l.pax_type} onChange={(e) => setLine(l.key, { pax_type: e.target.value })} disabled={ro}>{Object.entries(paxTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                  <Field label="Quantité" htmlFor={`q-${l.key}`}><Input id={`q-${l.key}`} type="number" min={0.01} step="0.01" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: n(e.target.value) })} disabled={ro} /></Field>
                  <Field label={`Prix unitaire client (${h.currency})`} htmlFor={`up-${l.key}`}><Input id={`up-${l.key}`} type="number" min={0} step="0.001" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: n(e.target.value) })} disabled={ro} /></Field>
                  {canMargins ? (
                    <>
                      <Field label="Coût unitaire" htmlFor={`uc-${l.key}`}><Input id={`uc-${l.key}`} type="number" min={0} step="0.001" value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: n(e.target.value) })} disabled={ro} /></Field>
                      <Field label="Devise coût" htmlFor={`cc-${l.key}`}>
                        <Select id={`cc-${l.key}`} value={l.cost_currency} onChange={(e) => setLine(l.key, { cost_currency: e.target.value, fx_rate: e.target.value === 'TND' ? 1 : l.fx_rate })} disabled={ro}>
                          {['TND', 'EUR', 'USD', 'SAR', 'TRY', 'GBP'].map((c) => <option key={c}>{c}</option>)}
                        </Select>
                      </Field>
                      <Field label="Taux → TND" htmlFor={`fx-${l.key}`}><Input id={`fx-${l.key}`} type="number" min={0.000001} step="0.000001" value={l.fx_rate} onChange={(e) => setLine(l.key, { fx_rate: n(e.target.value) })} disabled={ro || l.cost_currency === 'TND'} /></Field>
                    </>
                  ) : null}
                  {l.service_type === 'hotel' ? (
                    <>
                      <Field label="Chambre" htmlFor={`rt-${l.key}`}><Input id={`rt-${l.key}`} value={l.room_type ?? ''} onChange={(e) => setLine(l.key, { room_type: e.target.value })} disabled={ro} /></Field>
                      <Field label="Pension" htmlFor={`bd-${l.key}`}>
                        <Select id={`bd-${l.key}`} value={l.board ?? ''} onChange={(e) => setLine(l.key, { board: e.target.value })} disabled={ro}>
                          <option value="">—</option>{Object.entries(boardLabels).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                        </Select>
                      </Field>
                    </>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={l.is_optional} onChange={(e) => setLine(l.key, { is_optional: e.target.checked, option_selected: e.target.checked ? l.option_selected : false })} disabled={ro} /> Ligne optionnelle</label>
                  {l.is_optional ? <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={l.option_selected} onChange={(e) => setLine(l.key, { option_selected: e.target.checked })} disabled={ro} /> Option retenue par le client</label> : null}
                  <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={l.is_mandatory} onChange={(e) => setLine(l.key, { is_mandatory: e.target.checked })} disabled={ro} /> Prestation obligatoire (bloque la confirmation tant que non confirmée)</label>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {/* Totaux : mêmes règles que la vue SQL quote_version_totals */}
      <section className="grid gap-3 rounded-lg bg-brand-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-muted">Total client</p><p className="font-display text-2xl font-semibold text-brand-900 tabular">{formatMoney(totals.totalPrice, h.currency)}</p></div>
        <div><p className="text-xs text-muted">Options non retenues</p><p className="text-lg tabular">{formatMoney(totals.optionalTotal, h.currency)}</p></div>
        <div className="text-xs text-muted">
          <p>Adultes : {formatMoney(totals.byPax.adult, h.currency)}</p>
          <p>Enfants : {formatMoney(totals.byPax.child, h.currency)}</p>
          <p>Bébés : {formatMoney(totals.byPax.infant, h.currency)}</p>
          <p>Commun : {formatMoney(totals.byPax.all, h.currency)}</p>
        </div>
        {canMargins ? (
          <div>
            <p className="text-xs text-muted">Coût interne (TND) / marge</p>
            <p className="tabular">{formatMoney(totals.totalCostTnd)}</p>
            <p className={cn('font-semibold tabular', totals.margin < 0 ? 'text-danger-700' : 'text-success-600')}>{formatMoney(totals.margin)}{totals.marginRate != null ? ` (${totals.marginRate.toLocaleString('fr-FR')} %)` : ''}</p>
            {lines.some((l) => (!l.is_optional || l.option_selected) && l.unit_cost === 0) ? <p className="text-xs text-warning-600">Coûts incomplets : marge provisoire</p> : null}
          </div>
        ) : null}
      </section>

      {/* Échéancier */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-brand-900">Modalités de paiement</h3>
          {!ro ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => { setTerms((ts) => [...ts, { key: key(), label: ts.length ? 'Solde' : 'Acompte', kind: ts.length ? 'balance' : 'deposit', mode: 'percent', value: ts.length ? 70 : 30, due: ts.length ? 'days' : 'date', days_before_departure: 15, due_date: new Date().toISOString().slice(0, 10) }]); setDirty(true) }}>+ Échéance</Button>
          ) : null}
        </div>
        {terms.length === 0 ? <p className="text-sm text-muted">Aucune modalité : le dossier sera créé sans échéancier (à compléter).</p> : (
          <div className="space-y-2">
            {terms.map((t, i) => (
              <div key={t.key} className="grid items-end gap-2 rounded-lg border border-line p-2 sm:grid-cols-2 lg:grid-cols-7">
                <Field label="Libellé" htmlFor={`tl-${t.key}`}><Input id={`tl-${t.key}`} value={t.label} onChange={(e) => setTerm(t.key, { label: e.target.value })} disabled={ro} /></Field>
                <Field label="Nature" htmlFor={`tk-${t.key}`}>
                  <Select id={`tk-${t.key}`} value={t.kind} onChange={(e) => setTerm(t.key, { kind: e.target.value as Term['kind'] })} disabled={ro}>{Object.entries(scheduleKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                </Field>
                <Field label="Calcul" htmlFor={`tm-${t.key}`}>
                  <Select id={`tm-${t.key}`} value={t.mode} onChange={(e) => setTerm(t.key, { mode: e.target.value as Term['mode'] })} disabled={ro}><option value="percent">Pourcentage</option><option value="amount">Montant fixe</option></Select>
                </Field>
                <Field label={t.mode === 'percent' ? '%' : `Montant (${h.currency})`} htmlFor={`tv-${t.key}`}><Input id={`tv-${t.key}`} type="number" min={0} step={t.mode === 'percent' ? '0.01' : '0.001'} value={t.value} onChange={(e) => setTerm(t.key, { value: n(e.target.value) })} disabled={ro} /></Field>
                <Field label="Échéance" htmlFor={`td-${t.key}`}>
                  <Select id={`td-${t.key}`} value={t.due} onChange={(e) => setTerm(t.key, { due: e.target.value as Term['due'] })} disabled={ro}><option value="date">Date fixe</option><option value="days">Jours avant départ</option></Select>
                </Field>
                {t.due === 'date'
                  ? <Field label="Date" htmlFor={`tdd-${t.key}`}><Input id={`tdd-${t.key}`} type="date" value={t.due_date ?? ''} onChange={(e) => setTerm(t.key, { due_date: e.target.value })} disabled={ro} /></Field>
                  : <Field label="Jours avant départ" htmlFor={`tdb-${t.key}`}><Input id={`tdb-${t.key}`} type="number" min={0} value={t.days_before_departure ?? 0} onChange={(e) => setTerm(t.key, { days_before_departure: Math.max(0, Math.trunc(n(e.target.value))) })} disabled={ro} /></Field>}
                <div className="flex items-center justify-between gap-2 pb-2 text-sm">
                  <span className="font-medium tabular">{formatMoney(termAmounts[i] ?? 0, h.currency)}</span>
                  {!ro ? <Button type="button" size="sm" variant="ghost" onClick={() => { setTerms((ts) => ts.filter((x) => x.key !== t.key)); setDirty(true) }}>Retirer</Button> : null}
                </div>
              </div>
            ))}
            <p className={cn('text-sm', balanced ? 'text-success-600' : 'font-medium text-danger-700')}>
              Échéancier : {formatMoney(scheduled, h.currency)} / total {formatMoney(totals.totalPrice, h.currency)} {balanced ? '— équilibré' : '— à équilibrer avant l’envoi'}
            </p>
          </div>
        )}
      </section>

      {/* Programme, inclusions, exclusions */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-brand-900">Programme</h3>
            {!ro ? <Button type="button" size="sm" variant="secondary" onClick={() => { setProgram((p) => [...p, { key: key(), day: (p.at(-1)?.day ?? 0) + 1, title: '', description: '' }]); setDirty(true) }}>+ Jour</Button> : null}
          </div>
          <div className="space-y-2">
            {program.length === 0 ? <p className="text-sm text-muted">Aucun programme jour par jour.</p> : null}
            {program.map((p) => (
              <div key={p.key} className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[5rem_1fr_auto]">
                <Input type="number" min={1} value={p.day} aria-label="Jour" onChange={(e) => { setProgram((ps) => ps.map((x) => (x.key === p.key ? { ...x, day: Math.max(1, Math.trunc(n(e.target.value))) } : x))); setDirty(true) }} disabled={ro} />
                <Input value={p.title} placeholder="Titre de la journée" aria-label="Titre" onChange={(e) => { setProgram((ps) => ps.map((x) => (x.key === p.key ? { ...x, title: e.target.value } : x))); setDirty(true) }} disabled={ro} />
                {!ro ? <Button type="button" size="sm" variant="ghost" onClick={() => { setProgram((ps) => ps.filter((x) => x.key !== p.key)); setDirty(true) }}>Retirer</Button> : <span />}
                <Textarea value={p.description} placeholder="Description" aria-label="Description" className="min-h-12! sm:col-span-3" onChange={(e) => { setProgram((ps) => ps.map((x) => (x.key === p.key ? { ...x, description: e.target.value } : x))); setDirty(true) }} disabled={ro} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <Field label="Inclus (une ligne par élément)" htmlFor="qv_inc"><Textarea id="qv_inc" value={h.inclusionsText} onChange={(e) => setHeader({ inclusionsText: e.target.value })} disabled={ro} /></Field>
          <Field label="Non inclus (une ligne par élément)" htmlFor="qv_exc"><Textarea id="qv_exc" value={h.exclusionsText} onChange={(e) => setHeader({ exclusionsText: e.target.value })} disabled={ro} /></Field>
        </div>
        <Field label="Conditions et remarques pour le client" htmlFor="qv_cn"><Textarea id="qv_cn" value={h.client_notes} onChange={(e) => setHeader({ client_notes: e.target.value })} disabled={ro} /></Field>
        <Field label="Notes internes (jamais imprimées)" htmlFor="qv_in"><Textarea id="qv_in" value={h.internal_notes} onChange={(e) => setHeader({ internal_notes: e.target.value })} disabled={ro} /></Field>
      </section>

      {!ro ? (
        <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-5 py-3 backdrop-blur">
          <Button type="button" onClick={save} disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer la version'}</Button>
          {dirty ? <span className="text-sm text-warning-600">Modifications non enregistrées</span> : null}
          <div className="min-w-60 flex-1"><FormMessage state={state} /></div>
        </div>
      ) : (
        <Alert tone="info">Version figée : toute modification passe par une nouvelle version.</Alert>
      )}
    </div>
  )
}
