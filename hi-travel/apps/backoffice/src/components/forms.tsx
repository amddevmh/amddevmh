'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Alert, Button } from '@hi/ui'
import type { ActionState } from '@/lib/actions'

export function SubmitButton({ children, pendingLabel = 'Enregistrement…', variant = 'primary', size = 'md', className, name, value, confirm }: {
  children: ReactNode
  pendingLabel?: string
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  name?: string
  value?: string
  /** Message de confirmation avant un envoi engageant */
  confirm?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      className={className}
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

export function FormMessage({ state, successHref, successLabel }: { state: ActionState; successHref?: string; successLabel?: string }) {
  if (state.error) return <Alert tone="danger"><span className="whitespace-pre-line">{state.error}</span></Alert>
  if (state.ok && state.message) {
    return (
      <Alert tone="success">
        {state.message}
        {successHref ? <> — <Link className="font-semibold underline" href={successHref}>{successLabel ?? 'Ouvrir'}</Link></> : null}
      </Alert>
    )
  }
  return null
}

export function fieldError(state: ActionState, name: string): string | undefined {
  return state.fieldErrors?.[name]?.[0]
}

/**
 * Formulaire relié à une Server Action (useActionState) avec message d'état et
 * réinitialisation optionnelle après succès. Utilisable depuis un Server Component :
 * passer des enfants ReactNode (les enfants-fonctions ne sont possibles que côté client).
 * `successHrefPrefix` + `state.id` produit le lien « Ouvrir » après création.
 */
export function ActionForm({ action, children, className, resetOnSuccess = false, successHrefPrefix, successLabel }: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  children: ReactNode | ((state: ActionState) => ReactNode)
  className?: string
  resetOnSuccess?: boolean
  successHrefPrefix?: string
  successLabel?: string
}) {
  const [state, formAction] = useActionState(action, { ok: false } as ActionState)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset()
  }, [state, resetOnSuccess])
  return (
    <form ref={ref} action={formAction} className={className} noValidate={false}>
      <div className="space-y-4">
        {typeof children === 'function' ? children(state) : children}
        <FormMessage state={state} successHref={successHrefPrefix && state.id ? `${successHrefPrefix}${state.id}` : undefined} successLabel={successLabel} />
      </div>
    </form>
  )
}
