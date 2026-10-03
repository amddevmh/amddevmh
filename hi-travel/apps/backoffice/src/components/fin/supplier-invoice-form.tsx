'use client'

import { useState, useTransition } from 'react'
import { formatMoney } from '@hi/core'
import { Alert, Button, Field, Input, Select, Textarea } from '@hi/ui'
import { FormMessage } from '@/components/forms'
import { PendingButton, useStickyAction } from './sticky-form'
import type { ActionState } from '@/lib/actions'
import { parseAmount } from '@/lib/fin/format'

export function SupplierInvoiceForm({ action, suggest, suppliers, withholdingRules, defaultSupplierId, today }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>
  suggest: (currency: string, date: string) => Promise<{ rate?: number; date?: string; source?: string; error?: string }>
  suppliers: Array<{ id: string; name: string; currency: string; withholding_applicable: boolean }>
  withholdingRules: Array<{ code: string; label: string; rate: number; validated: boolean }>
  defaultSupplierId?: string
  today: string
}) {
  const { state, onSubmit, pending } = useStickyAction(action)
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? '')
  const supplier = suppliers.find((s) => s.id === supplierId)
  const [currency, setCurrency] = useState(supplier?.currency ?? 'TND')
  const [issueDate, setIssueDate] = useState(today)
  const [fx, setFx] = useState({ rate: '1', date: today, source: '' })
  const [fxMsg, setFxMsg] = useState<string | null>(null)
  const [total, setTotal] = useState('')
  const [whRule, setWhRule] = useState('')
  const [whBase, setWhBase] = useState('')
  const [whAmount, setWhAmount] = useState('0')
  const [fxPending, start] = useTransition()
  const fe = (k: string) => state.fieldErrors?.[k]?.[0]
  const duplicate = !!state.error?.includes('Doublon') || !!state.fieldErrors?.duplicate_justification

  const askFx = (cur = currency, date = issueDate) => {
    if (cur === 'TND') { setFx({ rate: '1', date, source: '' }); return }
    start(async () => {
      const r = await suggest(cur, date)
      if (r.error || r.rate == null) setFxMsg(r.error ?? 'Aucun taux proposé : saisissez le taux appliqué')
      else {
        setFx({ rate: String(r.rate), date: r.date ?? date, source: r.source ?? '' })
        setFxMsg(`Taux proposé : 1 ${cur} = ${r.rate} TND (${r.source}, ${r.date}). Modifiable si le taux réellement appliqué diffère.`)
      }
    })
  }
  const totalN = parseAmount(total) || 0
  const rule = withholdingRules.find((r) => r.code === whRule)

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Fournisseur" htmlFor="supplier_id" required error={fe('supplier_id')}>
          <Select id="supplier_id" name="supplier_id" value={supplierId} onChange={(e) => {
            setSupplierId(e.target.value)
            const s = suppliers.find((x) => x.id === e.target.value)
            if (s) { setCurrency(s.currency); askFx(s.currency) }
          }}>
            <option value="">— Choisir —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Référence de la pièce fournisseur" htmlFor="supplier_ref" required error={fe('supplier_ref')}>
          <Input id="supplier_ref" name="supplier_ref" required />
        </Field>
        <Field label="Date de la pièce" htmlFor="issue_date" required>
          <Input id="issue_date" name="issue_date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
        </Field>
        <Field label="Période de prestation — début" htmlFor="service_period_start" hint="Prévaut sur la date d’émission pour le rapprochement">
          <Input id="service_period_start" name="service_period_start" type="date" />
        </Field>
        <Field label="Période de prestation — fin" htmlFor="service_period_end" error={fe('service_period_end')}>
          <Input id="service_period_end" name="service_period_end" type="date" />
        </Field>
        <Field label="Échéance de paiement" htmlFor="due_date"><Input id="due_date" name="due_date" type="date" /></Field>
      </div>

      <fieldset className="grid gap-4 rounded-card border border-line p-4 md:grid-cols-4">
        <legend className="px-1 text-sm font-semibold text-brand-900">Montants et devise</legend>
        <Field label="Devise" htmlFor="currency">
          <Select id="currency" name="currency" value={currency} onChange={(e) => { setCurrency(e.target.value); askFx(e.target.value) }}>
            {['TND', 'EUR', 'USD', 'SAR', 'GBP', 'TRY'].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Montant total de la pièce" htmlFor="total_amount" required error={fe('total_amount')} hint="Dans la devise de la pièce">
          <Input id="total_amount" name="total_amount" inputMode="decimal" className="text-right" value={total} onChange={(e) => setTotal(e.target.value)} required />
        </Field>
        <Field label="Dont taxes" htmlFor="tax_amount"><Input id="tax_amount" name="tax_amount" inputMode="decimal" className="text-right" defaultValue="0" /></Field>
        <div />
        {currency !== 'TND' ? (
          <>
            <Field label={`Taux (1 ${currency} = x TND)`} htmlFor="fx_rate" required error={fe('fx_rate')}>
              <Input id="fx_rate" name="fx_rate" inputMode="decimal" className="text-right" value={fx.rate} onChange={(e) => setFx({ ...fx, rate: e.target.value })} />
            </Field>
            <Field label="Date du taux" htmlFor="fx_rate_date" required>
              <Input id="fx_rate_date" name="fx_rate_date" type="date" value={fx.date} onChange={(e) => setFx({ ...fx, date: e.target.value })} />
            </Field>
            <Field label="Source du taux" htmlFor="fx_rate_source" required error={fe('fx_rate_source')}>
              <Input id="fx_rate_source" name="fx_rate_source" value={fx.source} onChange={(e) => setFx({ ...fx, source: e.target.value })} placeholder="BCT, banque, fournisseur…" />
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={() => askFx()} disabled={fxPending}>{fxPending ? "Recherche…" : "Proposer un taux"}</Button>
            </div>
            {fxMsg ? <p className="text-xs text-muted md:col-span-4">{fxMsg}</p> : null}
            <p className="text-sm md:col-span-4">Contre-valeur estimée : <strong className="tabular">{formatMoney(Math.round(totalN * (parseAmount(fx.rate) || 0) * 1000) / 1000)}</strong> — la conversion réellement réglée est enregistrée sur le règlement.</p>
          </>
        ) : <input type="hidden" name="fx_rate" value="1" />}
      </fieldset>

      <fieldset className="grid gap-4 rounded-card border border-line p-4 md:grid-cols-4">
        <legend className="px-1 text-sm font-semibold text-brand-900">Retenue à la source {supplier?.withholding_applicable ? '(applicable à ce fournisseur)' : ''}</legend>
        <Field label="Règle" htmlFor="withholding_rule">
          <Select id="withholding_rule" name="withholding_rule" value={whRule} onChange={(e) => setWhRule(e.target.value)}>
            <option value="">Aucune</option>
            {withholdingRules.map((r) => <option key={r.code} value={r.code}>{r.label} — {(r.rate * 100).toFixed(2)} %{r.validated ? '' : ' (à valider)'}</option>)}
          </Select>
        </Field>
        <Field label="Base" htmlFor="withholding_base"><Input id="withholding_base" name="withholding_base" inputMode="decimal" className="text-right" value={whBase} onChange={(e) => setWhBase(e.target.value)} placeholder={total} /></Field>
        <Field label="Montant retenu" htmlFor="withholding_amount"><Input id="withholding_amount" name="withholding_amount" inputMode="decimal" className="text-right" value={whAmount} onChange={(e) => setWhAmount(e.target.value)} /></Field>
        <div className="flex items-end">
          <Button type="button" variant="ghost" disabled={!rule} onClick={() => {
            const base = parseAmount(whBase) || totalN
            setWhBase(String(base))
            setWhAmount(String(Math.round(base * (rule?.rate ?? 0) * 1000) / 1000))
          }}>Proposer selon la règle</Button>
        </div>
        {rule && !rule.validated ? <p className="text-xs text-warning-600 md:col-span-4">Règle non encore validée par le comptable (FIN08) : montant à confirmer.</p> : null}
      </fieldset>

      {duplicate ? (
        <Alert tone="warning" title="Doublon probable">
          Cette référence existe déjà pour ce fournisseur. Si l’exception est justifiée (pièce distincte, refacturation…), précisez-la ci-dessous puis enregistrez à nouveau.
        </Alert>
      ) : null}
      {duplicate ? (
        <Field label="Justification de l’exception" htmlFor="duplicate_justification" required error={fe('duplicate_justification')}>
          <Textarea id="duplicate_justification" name="duplicate_justification" rows={2} />
        </Field>
      ) : null}
      <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} /></Field>
      <FormMessage state={state} />
      <div className="flex justify-end"><PendingButton pending={pending}>Enregistrer la pièce</PendingButton></div>
    </form>
  )
}
