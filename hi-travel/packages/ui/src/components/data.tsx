import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { formatDateFr, formatMoney } from '@hi/core'
import { cn } from '../cn'
import { Badge } from './primitives'

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('border-b border-line bg-canvas px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted', className)} {...props} />
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line px-3 py-2.5 align-top', className)} {...props} />
}

/** Montant formaté TND (3 décimales), aligné à droite. */
export function Money({ value, currency = 'TND', className }: { value: number | string | null | undefined; currency?: string; className?: string }) {
  const n = value == null ? null : Number(value)
  return <span className={cn('tabular whitespace-nowrap', n != null && n < 0 && 'text-danger-700', className)}>{formatMoney(n, currency)}</span>
}

export function DateText({ value, className }: { value: string | null | undefined; className?: string }) {
  return <span className={cn('tabular whitespace-nowrap', className)}>{formatDateFr(value)}</span>
}

const STATUS_TONES: Record<string, 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info'> = {
  // commercial
  request: 'neutral', quote_prepared: 'neutral', quote_sent: 'info', accepted: 'brand', booking: 'warning',
  confirmed: 'success', travelling: 'accent', completed: 'success', archived: 'neutral', cancelled: 'danger',
  // prestations
  requested: 'neutral', option: 'warning',
  // paiements / factures
  planned: 'neutral', received: 'info', deposited: 'warning', validated: 'success', rejected: 'danger', draft: 'neutral',
  // tâches
  todo: 'neutral', in_progress: 'info', waiting_client: 'warning', waiting_supplier: 'warning', blocked: 'danger', done: 'success',
  // priorité
  red: 'danger', orange: 'warning',
  // publication
  review: 'warning', published: 'success', hidden: 'neutral',
  // leads
  received_lead: 'info', qualification: 'info', quote: 'brand', follow_up: 'warning', won: 'success', lost: 'danger',
  // checks
  ok: 'success', to_complete: 'warning', blocking: 'danger', na: 'neutral',
  // alertes
  to_review: 'warning', justified: 'neutral', corrected: 'success', resolved: 'success',
  // imports
  new: 'success', duplicate: 'neutral', modified: 'info', invalid: 'danger', ambiguous: 'warning',
  sent: 'info', superseded: 'neutral', expired: 'neutral', to_verify: 'warning', failed: 'danger', pending: 'warning',
}

/** Badge de statut : libellé en plus de la couleur (JOU02). */
export function StatusBadge({ status, labels, className }: { status: string | null | undefined; labels?: Record<string, string>; className?: string }) {
  if (!status) return <Badge>—</Badge>
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {labels?.[status] ?? status}
    </Badge>
  )
}

export function DefinitionList({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 text-sm text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
