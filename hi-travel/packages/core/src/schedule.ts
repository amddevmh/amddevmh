import { addDays } from './dates'
import { fromMinor, toMinor } from './money'

export type ScheduleKind = 'deposit' | 'installment' | 'balance'

export interface PaymentTerm {
  label: string
  kind: ScheduleKind
  amount?: number
  percent?: number
  due_date?: string
  days_before_departure?: number
}

export interface ScheduleItem {
  seq: number
  label: string
  kind: ScheduleKind
  amount: number
  dueDate: string | null
}

/**
 * Échéancier librement paramétrable (montant fixe, pourcentage, date ou délai avant départ).
 * Le dernier élément « solde » absorbe l'arrondi pour reconstituer exactement le total.
 */
export function buildSchedule(total: number, terms: PaymentTerm[], departureDate?: string | null): ScheduleItem[] {
  const totalMinor = toMinor(total)
  let done = 0
  const items = terms.map((t, i) => {
    let minor: number
    const isLast = i === terms.length - 1
    if (isLast && t.kind === 'balance' && t.amount == null && t.percent == null) {
      minor = totalMinor - done
    } else if (t.amount != null) {
      minor = toMinor(t.amount)
    } else if (t.percent != null) {
      minor = isLast && t.kind === 'balance' ? totalMinor - done : Math.round((totalMinor * t.percent) / 100)
    } else {
      throw new Error(`Échéance « ${t.label} » sans montant ni pourcentage`)
    }
    done += minor
    const dueDate =
      t.due_date ?? (departureDate && t.days_before_departure != null ? addDays(departureDate, -t.days_before_departure) : null)
    return { seq: i + 1, label: t.label, kind: t.kind, amount: fromMinor(minor), dueDate }
  })
  if (done !== totalMinor) {
    throw new Error(`L’échéancier (${fromMinor(done)}) ne correspond pas au total (${total})`)
  }
  return items
}

/** Solde restant calculé uniquement à partir des règlements validés. */
export function remainingBalance(total: number, validatedPayments: number[]): number {
  return fromMinor(toMinor(total) - validatedPayments.reduce((a, p) => a + toMinor(p), 0))
}
