import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../cn'

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
  secondary: 'bg-white text-brand-700 border border-line hover:bg-brand-50',
  accent: 'bg-accent-400 text-brand-900 hover:bg-accent-500 shadow-sm',
  ghost: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
}
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap',
    buttonVariants[variant],
    buttonSizes[size],
    className,
  )
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)} {...props} />
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div>
        <h2 className="text-base font-semibold text-brand-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />
}

const fieldBase =
  'block w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-canvas aria-invalid:border-danger-600'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'h-10', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-24 py-2', className)} {...props} />
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-sm font-medium text-ink', className)} {...props} />
}

/** Champ de formulaire : libellé, aide et erreur explicites (FO03). */
export function Field({ label, htmlFor, hint, error, required, children, className }: {
  label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-danger-600" aria-hidden>*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-medium text-danger-600" role="alert">{error}</p> : null}
    </div>
  )
}

type Tone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
const tones: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted ring-line',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  accent: 'bg-accent-50 text-accent-700 ring-accent-100',
  success: 'bg-success-50 text-success-600 ring-success-600/20',
  warning: 'bg-warning-50 text-warning-600 ring-warning-600/20',
  danger: 'bg-danger-50 text-danger-700 ring-danger-600/20',
  info: 'bg-info-50 text-info-600 ring-info-600/20',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Alert({ tone = 'info', title, children, className }: { tone?: Exclude<Tone, 'neutral' | 'brand' | 'accent'>; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-lg px-4 py-3 text-sm ring-1 ring-inset', tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : undefined}>{children}</div> : null}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="font-medium text-brand-900">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Stat({ label, value, hint, tone = 'neutral', href }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'neutral' | 'danger' | 'warning' | 'success'; href?: string }) {
  const toneClass = { neutral: 'text-brand-900', danger: 'text-danger-700', warning: 'text-warning-600', success: 'text-success-600' }[tone]
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-1 font-display text-2xl font-semibold tabular', toneClass)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </>
  )
  const cls = 'block rounded-card border border-line bg-surface px-4 py-3 transition-colors'
  return href ? <a href={href} className={cn(cls, 'hover:border-brand-300 hover:bg-brand-50/40')}>{inner}</a> : <div className={cls}>{inner}</div>
}
