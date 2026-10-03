'use client'

import { startTransition, useActionState, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Alert, Button, Field, Input } from '@hi/ui'
import type { PasswordActionState } from '@/lib/password'

const MIN = 12
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%&*?-_+='

/** Entier aléatoire uniforme dans [0, n) (générateur cryptographique, rejet des valeurs biaisées). */
function randomInt(n: number): number {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / n) * n
  let v = limit
  while (v >= limit) v = crypto.getRandomValues(buf)[0] ?? limit
  return v % n
}

const pick = (set: string) => set.charAt(randomInt(set.length))

/** Mot de passe aléatoire de 16 caractères (minuscules, majuscules, chiffres, symboles ; sans caractères ambigus). */
export function generatePassword(length = 16): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < length) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const tmp = chars[i] ?? ''
    chars[i] = chars[j] ?? ''
    chars[j] = tmp
  }
  return chars.join('')
}

/** Champ « mot de passe » contrôlé, avec génération aléatoire et affichage à la demande. */
export function PasswordField({ id, name = 'password', label, hint, value, onChange, error }: {
  id: string; name?: string; label: ReactNode; hint?: ReactNode; value: string; onChange: (v: string) => void; error?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} htmlFor={id} required hint={hint ?? `${MIN} caractères minimum`} error={error}>
      <div className="space-y-2">
        <Input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={MIN}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => { onChange(generatePassword()); setVisible(true) }}>Générer</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>{visible ? 'Masquer' : 'Afficher'}</Button>
        </div>
      </div>
    </Field>
  )
}

/** Mot de passe affiché une seule fois après création ou réinitialisation. */
export function OneTimePassword({ password, email, title = 'Mot de passe défini' }: { password: string; email?: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Alert tone="success" title={title}>
      {email ? <p>Identifiant : <span className="font-medium">{email}</span></p> : null}
      <p className="mt-1 flex flex-wrap items-center gap-2">
        Mot de passe : <code className="break-all rounded bg-white px-2 py-0.5 font-mono text-sm text-ink ring-1 ring-line" data-testid="one-time-password">{password}</code>
        <button
          type="button"
          className="text-xs font-semibold underline"
          onClick={() => { void navigator.clipboard?.writeText(password).then(() => setCopied(true)) }}
        >
          {copied ? 'Copié' : 'Copier'}
        </button>
      </p>
      <p className="mt-2 text-xs">Il ne sera plus affiché : transmettez-le par un canal sûr (en main propre, téléphone, message séparé de l’identifiant), jamais avec l’identifiant dans le même e-mail.</p>
    </Alert>
  )
}

/** Envoi d’un formulaire sans la réinitialisation automatique de React (la saisie est conservée en cas d’erreur). */
export function submitWithoutReset(formAction: (fd: FormData) => void, confirmMessage?: string) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (confirmMessage && !window.confirm(confirmMessage)) return
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }
}

/**
 * Réinitialisation d’un mot de passe par un collaborateur habilité (clé service côté serveur) :
 * saisie ou génération, puis affichage unique du nouveau mot de passe.
 */
export function PasswordResetForm({ action, hidden, idPrefix, submitLabel = 'Réinitialiser le mot de passe', confirm, onIssued }: {
  action: (state: PasswordActionState, formData: FormData) => Promise<PasswordActionState>
  hidden: Record<string, string>
  idPrefix: string
  submitLabel?: string
  confirm?: string
  /** Prévenu quand un nouveau mot de passe est émis (pour masquer un mot de passe affiché ailleurs, devenu caduc) */
  onIssued?: (issuedAt: number) => void
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as PasswordActionState)
  useEffect(() => {
    if (state.ok && state.issuedAt) onIssued?.(state.issuedAt)
  }, [state, onIssued])
  const [password, setPassword] = useState('')
  const [shownFor, setShownFor] = useState<number | undefined>(undefined)
  // Après succès, le champ est vidé : le mot de passe n’est plus visible qu’une fois, dans l’encadré
  if (state.ok && state.issuedAt && state.issuedAt !== shownFor) {
    setShownFor(state.issuedAt)
    setPassword('')
  }
  return (
    <form onSubmit={submitWithoutReset(formAction, confirm)} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <PasswordField id={`${idPrefix}-password`} label="Nouveau mot de passe" value={password} onChange={setPassword} error={state.fieldErrors?.password?.[0]} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>{pending ? 'Réinitialisation…' : submitLabel}</Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.password ? <OneTimePassword password={state.password} email={state.email} title={state.message ?? 'Mot de passe réinitialisé'} /> : null}
    </form>
  )
}
