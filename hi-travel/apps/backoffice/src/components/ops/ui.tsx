import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, Card, CardBody, CardHeader, Input, Select, cn } from '@hi/ui'
import { priorityLabels } from '@hi/core'
import { timeRemaining } from '@/lib/ops/format'

/** Priorité expliquée : couleur + libellé + motif textuel (JOU02). */
export function PriorityBadge({ level, reason, compact = false }: { level: string | null | undefined; reason?: string | null; compact?: boolean }) {
  const tone = level === 'red' ? 'danger' : level === 'orange' ? 'warning' : level === 'done' ? 'success' : 'info'
  const dot = level === 'red' ? 'bg-danger-600' : level === 'orange' ? 'bg-accent-400' : level === 'done' ? 'bg-success-600' : 'bg-brand-300'
  return (
    <div className="flex flex-col gap-0.5">
      <Badge tone={tone}>
        <span className={cn('inline-block size-2 rounded-full', dot)} aria-hidden />
        {priorityLabels[level ?? ''] ?? level ?? '—'}
      </Badge>
      {reason && !compact ? <span className="text-xs text-muted">{reason}</span> : null}
    </div>
  )
}

export function TimeLeft({ dueAt }: { dueAt: string | null | undefined }) {
  const r = timeRemaining(dueAt)
  return <span className={cn('whitespace-nowrap text-xs', r.overdue ? 'font-semibold text-danger-700' : 'text-muted')}>{r.label}</span>
}

export function Section({ title, description, actions, children, className, bodyClassName }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} actions={actions} />
      <CardBody className={bodyClassName}>{children}</CardBody>
    </Card>
  )
}

/** Sous-formulaire repliable (ajout/modification) pour garder les écrans lisibles. */
export function Disclosure({ summary, children, open = false, className }: { summary: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details open={open} className={cn('group rounded-lg border border-line bg-white', className)}>
      <summary className="cursor-pointer select-none list-none px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 [&::-webkit-details-marker]:hidden">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>
        {summary}
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  )
}

export function StaffSelect({ staff, name, defaultValue, emptyLabel = '— Non attribué —', id, required }: {
  staff: Array<{ id: string; full_name: string; active?: boolean }>; name: string; defaultValue?: string | null; emptyLabel?: string; id?: string; required?: boolean
}) {
  return (
    <Select name={name} id={id ?? name} defaultValue={defaultValue ?? ''} required={required}>
      <option value="">{emptyLabel}</option>
      {staff.filter((s) => s.active !== false || s.id === defaultValue).map((s) => (
        <option key={s.id} value={s.id}>{s.full_name}</option>
      ))}
    </Select>
  )
}

export function LabelSelect({ labels, name, defaultValue, emptyLabel, id, required, keys }: {
  labels: Record<string, string>; name: string; defaultValue?: string | null; emptyLabel?: string; id?: string; required?: boolean; keys?: readonly string[]
}) {
  return (
    <Select name={name} id={id ?? name} defaultValue={defaultValue ?? ''} required={required}>
      {emptyLabel != null ? <option value="">{emptyLabel}</option> : null}
      {(keys ?? Object.keys(labels)).map((k) => (
        <option key={k} value={k}>{labels[k] ?? k}</option>
      ))}
    </Select>
  )
}

/** Champ simple d’une barre de filtres. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  )
}

export function FilterInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={cn('h-10 min-w-36', props.className)} />
}

export function ResetLink({ href }: { href: string }) {
  return <Link href={href} className="h-10 px-2 text-sm leading-10 text-muted hover:text-brand-700">Réinitialiser</Link>
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted">{children}</span>
}

/** Petit indicateur chiffré cliquable (ouvre la liste filtrée correspondante). */
export function Counter({ label, value, href, tone = 'neutral', hint }: {
  label: string; value: ReactNode; href: string; tone?: 'neutral' | 'danger' | 'warning' | 'success'; hint?: string
}) {
  const toneClass = { neutral: 'text-brand-900', danger: 'text-danger-700', warning: 'text-warning-600', success: 'text-success-600' }[tone]
  const bar = { neutral: 'bg-brand-200', danger: 'bg-danger-600', warning: 'bg-accent-400', success: 'bg-success-600' }[tone]
  return (
    <Link href={href} className="group relative block overflow-hidden rounded-card border border-line bg-surface px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
      <span className={cn('absolute inset-y-0 left-0 w-1', bar)} aria-hidden />
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn('mt-1 font-display text-2xl font-semibold tabular', toneClass)}>{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <span className="absolute bottom-2 right-3 text-xs text-brand-400 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>Voir →</span>
    </Link>
  )
}
