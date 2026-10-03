'use client'

import { startTransition, useActionState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@hi/ui'
import type { ActionState } from '@/lib/actions'

/**
 * Action de formulaire sans réinitialisation automatique (React 19 vide les champs non contrôlés
 * après une action) : en cas d'erreur métier, la saisie est conservée pour correction.
 */
export function useStickyAction(action: (s: ActionState, f: FormData) => Promise<ActionState>) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as ActionState)
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const fd = new FormData(e.currentTarget, submitter ?? undefined)
    startTransition(() => formAction(fd))
  }
  return { state, onSubmit, pending }
}

export function PendingButton({ pending, children, pendingLabel = 'Enregistrement…', confirm, variant = 'primary', name, value, size }: {
  pending: boolean
  children: ReactNode
  pendingLabel?: string
  confirm?: string
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'
  name?: string
  value?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      name={name}
      value={value}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault()
      }}
    >
      {pending ? pendingLabel : children}
    </Button>
  )
}
