'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert, Button, Input } from '@hi/ui'
import { login, requestPasswordReset, updatePassword } from '@/actions/auth'
import { idleState } from '@/lib/forms'
import { t } from '@/lib/i18n'
import { FormField, a11yProps } from './form-field'

const p = t.portal

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState(login, idleState)
  const error = state.status === 'error' ? state.error : initialError
  return (
    <form action={action} className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      <FormField id="login-email" label={p.email} required>
        <Input id="login-email" name="email" type="email" autoComplete="username" required inputMode="email" />
      </FormField>
      <FormField id="login-password" label={p.password} required>
        <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? p.loggingIn : p.login}</Button>
      <p className="text-center text-sm">
        <Link href="/espace-client/connexion/mot-de-passe-oublie" className="font-medium text-brand-600 underline-offset-2 hover:underline">{p.forgot}</Link>
      </p>
    </form>
  )
}

export function ResetRequestForm({ invalidLink }: { invalidLink?: boolean }) {
  const [state, action, pending] = useActionState(requestPasswordReset, idleState)
  if (state.status === 'success') {
    return <Alert tone="success">{state.message}</Alert>
  }
  const err = state.status === 'error' ? state.fieldErrors?.email : undefined
  return (
    <form action={action} className="space-y-5">
      {invalidLink ? <Alert tone="warning">{p.linkInvalid}</Alert> : null}
      <FormField id="reset-email" label={p.email} required error={err}>
        <Input name="email" type="email" autoComplete="email" required {...a11yProps('reset-email', err)} />
      </FormField>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{p.resetSubmit}</Button>
    </form>
  )
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, idleState)
  if (state.status === 'success') {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <Link href="/espace-client" className="font-medium text-brand-600 hover:underline">{p.myDossiers}</Link>
      </div>
    )
  }
  const fe = state.status === 'error' ? state.fieldErrors : undefined
  return (
    <form action={action} className="space-y-5">
      {state.status === 'error' && !fe ? <Alert tone="danger">{state.error}</Alert> : null}
      <FormField id="np-password" label={p.newPassword} required hint={p.passwordHint} error={fe?.password}>
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required {...a11yProps('np-password', fe?.password, p.passwordHint)} />
      </FormField>
      <FormField id="np-confirm" label={p.confirmPassword} required error={fe?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={10} required {...a11yProps('np-confirm', fe?.confirm)} />
      </FormField>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{p.newPasswordTitle}</Button>
    </form>
  )
}
