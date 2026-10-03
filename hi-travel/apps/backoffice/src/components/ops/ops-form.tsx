'use client'

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@hi/ui'
import { FormMessage } from '@/components/forms'
import type { ActionState } from '@/lib/actions'

const PendingContext = createContext(false)

/**
 * Formulaire relié à une Server Action, sans la réinitialisation automatique de React 19 :
 * la saisie est conservée en cas d’erreur (message SQL relayé) et n’est effacée qu’après
 * succès si `resetOnSuccess`. Le bouton cliqué (name/value) est transmis.
 */
export function OpsForm({ action, children, className, resetOnSuccess = false, successHrefPrefix, successLabel, inline = false }: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  children: ReactNode
  className?: string
  resetOnSuccess?: boolean
  successHrefPrefix?: string
  successLabel?: string
  inline?: boolean
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as ActionState)
  const ref = useRef<HTMLFormElement>(null)
  const [fieldList, setFieldList] = useState<string[]>([])
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset()
    // Erreurs par champ : marquage aria-invalid et rappel des libellés concernés
    const form = ref.current
    if (!form) return
    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'))
    const list: string[] = []
    for (const [name, msgs] of Object.entries(state.fieldErrors ?? {})) {
      if (!msgs?.length) continue
      const el = form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`)
      el?.setAttribute('aria-invalid', 'true')
      const labelText = el?.id ? form.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.replace('*', '').trim() : null
      list.push(`${labelText || name} : ${msgs[0]}`)
    }
    setFieldList(list)
  }, [state, resetOnSuccess])
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
    const fd = new FormData(e.currentTarget, submitter)
    startTransition(() => formAction(fd))
  }
  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      <PendingContext.Provider value={pending}>
        <div className={inline ? 'space-y-1' : 'space-y-4'}>
          {children}
          <FormMessage state={state} successHref={successHrefPrefix && state.id ? `${successHrefPrefix}${state.id}` : undefined} successLabel={successLabel} />
          {!state.ok && fieldList.length ? (
            <ul className="list-disc pl-5 text-xs text-danger-700" role="alert">{fieldList.map((f) => <li key={f}>{f}</li>)}</ul>
          ) : null}
        </div>
      </PendingContext.Provider>
    </form>
  )
}

export function OpsSubmit({ children, pendingLabel = 'Enregistrement…', variant = 'primary', size = 'md', className, name, value, confirm }: {
  children: ReactNode
  pendingLabel?: string
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  name?: string
  value?: string
  /** Confirmation avant une action engageante */
  confirm?: string
}) {
  const pending = useContext(PendingContext)
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
