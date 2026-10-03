'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useRef, useState, type FormEvent } from 'react'
import { formatMoney } from '@hi/core'
import { Alert, Button, Input, Select, Textarea } from '@hi/ui'
import { requestChange, startPayment } from '@/actions/portal'
import { idleState } from '@/lib/forms'
import { t } from '@/lib/i18n'
import { FormField, a11yProps } from './form-field'

const MAX = 10 * 1024 * 1024
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

/** Dépôt de pièce : contrôle immédiat du type et de la taille, contrôle définitif côté serveur. */
export function UploadForm({ dossierId }: { dossierId: string }) {
  const u = t.portal.upload
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; field?: string } | null>(null)

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    const file = fd.get('file')
    if (!(file instanceof File) || file.size === 0) return setResult({ ok: false, message: u.errors.missing, field: 'file' })
    if (!TYPES.includes(file.type)) return setResult({ ok: false, message: u.errors.type, field: 'file' })
    if (file.size > MAX) return setResult({ ok: false, message: u.errors.size, field: 'file' })
    setPending(true)
    setResult(null)
    try {
      const res = await fetch('/api/portal/documents', { method: 'POST', body: fd })
      const json = (await res.json().catch(() => ({ ok: false, error: u.errors.failed }))) as { ok: boolean; error?: string; message?: string; field?: string }
      setResult({ ok: json.ok, message: json.ok ? json.message ?? u.success : json.error ?? u.errors.failed, field: json.field })
      if (json.ok) {
        formRef.current?.reset()
        router.refresh()
      }
    } catch {
      setResult({ ok: false, message: u.errors.failed })
    } finally {
      setPending(false)
    }
  }

  const fileErr = result && !result.ok && result.field === 'file' ? result.message : undefined
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" encType="multipart/form-data" noValidate>
      <input type="hidden" name="dossier_id" value={dossierId} />
      {result && (result.ok || !result.field) ? <Alert tone={result.ok ? 'success' : 'danger'}>{result.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="up-kind" label={u.kind} required>
          <Select id="up-kind" name="kind" defaultValue="other">
            {Object.entries(u.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FormField>
        <FormField id="up-label" label={u.label} hint={u.labelHint}>
          <Input name="label" maxLength={120} {...a11yProps('up-label', undefined, u.labelHint)} />
        </FormField>
      </div>
      <FormField id="up-file" label={u.file} required error={fileErr} hint={u.intro}>
        <input
          type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp"
          className="block w-full rounded-lg border border-line bg-white text-sm file:mr-3 file:border-0 file:bg-brand-50 file:px-4 file:py-2.5 file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          {...a11yProps('up-file', fileErr, u.intro)}
        />
      </FormField>
      <Button type="submit" disabled={pending}>{pending ? u.submitting : u.submit}</Button>
    </form>
  )
}

export function ChangeRequestForm({ dossierId }: { dossierId: string }) {
  const c = t.portal.change
  const [state, action, pending] = useActionState(requestChange, idleState)
  if (state.status === 'success') return <Alert tone="success">{state.message}</Alert>
  const err = state.status === 'error' ? state.fieldErrors?.message ?? state.error : undefined
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="dossier_id" value={dossierId} />
      <FormField id="chg-kind" label={c.kind} required>
        <Select id="chg-kind" name="kind" defaultValue="modification">
          {Object.entries(c.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </FormField>
      <FormField id="chg-message" label={c.message} required hint={c.messageHint} error={err}>
        <Textarea name="message" rows={4} required minLength={10} maxLength={3000} {...a11yProps('chg-message', err, c.messageHint)} />
      </FormField>
      <Button type="submit" variant="secondary" disabled={pending}>{c.submit}</Button>
    </form>
  )
}

export interface PayChoice { value: string; label: string; amount: number }

/** Choix de l'échéance ou d'un montant ≤ solde, récapitulatif et conditions avant paiement (FO07). */
export function PaymentForm({ dossierId, reference, currency, balance, choices }: {
  dossierId: string; reference: string; currency: string; balance: number; choices: PayChoice[]
}) {
  const p = t.payment
  const [state, action, pending] = useActionState(startPayment, idleState)
  const [choice, setChoice] = useState(choices[0]?.value ?? 'other')
  const [other, setOther] = useState('')
  const amount = choice === 'other' ? Number(other.replace(',', '.')) || 0 : choices.find((c) => c.value === choice)?.amount ?? 0
  const fe = state.status === 'error' ? state.fieldErrors : undefined
  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <input type="hidden" name="dossier_id" value={dossierId} />
      <div className="space-y-6">
        {state.status === 'error' && state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <fieldset>
          <legend className="font-display text-base font-semibold text-brand-900">{p.chooseItem}</legend>
          <div className="mt-3 space-y-2">
            {choices.map((c) => (
              <label key={c.value} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <span className="flex items-center gap-3">
                  <input type="radio" name="choice" value={c.value} checked={choice === c.value} onChange={() => setChoice(c.value)} className="size-4 accent-brand-500" />
                  <span className="text-sm font-medium">{c.label}</span>
                </span>
                <span className="font-semibold tabular text-brand-700">{formatMoney(c.amount, currency)}</span>
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name="choice" value="other" checked={choice === 'other'} onChange={() => setChoice('other')} className="size-4 accent-brand-500" />
              <span className="text-sm font-medium">{p.otherAmount}</span>
            </label>
          </div>
        </fieldset>
        {choice === 'other' ? (
          <FormField id="pay-amount" label={p.amount} required hint={p.amountHint(formatMoney(balance, currency))} error={fe?.amount}>
            <Input
              name="amount" type="number" min={0.001} max={balance} step="0.001" inputMode="decimal" required className="sm:max-w-xs"
              value={other} onChange={(e) => setOther(e.target.value)}
              {...a11yProps('pay-amount', fe?.amount, p.amountHint(formatMoney(balance, currency)))}
            />
          </FormField>
        ) : null}
        <div className="rounded-card border border-line bg-white p-5">
          <h3 className="font-semibold text-brand-900">{p.conditionsTitle}</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink">
            {p.conditions.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <label className="mt-4 flex items-start gap-3 text-sm font-medium">
            <input type="checkbox" name="accept" required className="mt-0.5 size-5 accent-brand-500" aria-invalid={fe?.accept ? true : undefined} />
            <span>{p.acceptConditions} <a href="/conditions-de-vente" target="_blank" className="text-brand-600 underline">{t.footer.terms}</a></span>
          </label>
          {fe?.accept ? <p className="mt-1 text-xs font-medium text-danger-700">{fe.accept}</p> : null}
        </div>
      </div>
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-card border border-line bg-white p-6 shadow-lg">
          <h3 className="font-semibold text-brand-900">{p.summary}</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">{p.reference}</dt><dd className="font-medium">{reference}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{p.currency}</dt><dd className="font-medium">{currency}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t.portal.balance}</dt><dd className="font-medium tabular">{formatMoney(balance, currency)}</dd></div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3"><dt className="font-medium">{p.amount}</dt><dd className="font-display text-2xl font-semibold text-brand-700 tabular" data-testid="pay-amount">{formatMoney(amount, currency)}</dd></div>
          </dl>
          <Button type="submit" variant="accent" size="lg" className="mt-6 w-full" disabled={pending || amount <= 0 || amount > balance}>
            {pending ? p.redirecting : p.submit(formatMoney(amount, currency))}
          </Button>
        </div>
      </aside>
    </form>
  )
}
