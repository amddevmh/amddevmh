'use client'

import { useActionState } from 'react'
import { Alert, Field, Input } from '@hi/ui'
import { SubmitButton } from '@/components/forms'
import { signIn } from './actions'

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, { ok: false })
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="E-mail" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Mot de passe" htmlFor="password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton className="w-full" pendingLabel="Connexion…">Se connecter</SubmitButton>
    </form>
  )
}
