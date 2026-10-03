import type { ReactNode } from 'react'
import { cn } from '@hi/ui'

/** Attributs d'accessibilité d'un champ : erreur annoncée et reliée au champ (FO03). */
export function a11yProps(id: string, error?: string, hint?: ReactNode) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ')
  return {
    id,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy || undefined,
  }
}

export function FormField({ id, label, required, hint, error, children, className }: {
  id: string
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-danger-600" aria-hidden>*</span> : null}
      </label>
      {children}
      {hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="mt-1 text-xs font-medium text-danger-700">{error}</p> : null}
    </div>
  )
}

export function Fieldset({ legend, children, className }: { legend: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('min-w-0 space-y-4', className)}>
      <legend className="mb-3 font-display text-base font-semibold text-brand-900">{legend}</legend>
      {children}
    </fieldset>
  )
}

export function CheckboxField({ id, name, label, hint, error, required, defaultChecked }: {
  id: string; name: string; label: ReactNode; hint?: ReactNode; error?: string; required?: boolean; defaultChecked?: boolean
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          required={required}
          className="mt-0.5 size-5 shrink-0 rounded border-line accent-brand-500"
          {...a11yProps(id, error, hint)}
        />
        <label htmlFor={id} className="text-sm text-ink">
          {label}
          {required ? <span className="ml-0.5 text-danger-600" aria-hidden>*</span> : null}
        </label>
      </div>
      {hint ? <p id={`${id}-hint`} className="ml-8 mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="ml-8 mt-1 text-xs font-medium text-danger-700">{error}</p> : null}
    </div>
  )
}
