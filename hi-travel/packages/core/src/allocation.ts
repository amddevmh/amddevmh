import { fromMinor, toMinor, type Currency } from './money'

export interface AllocationTarget<T = string> {
  key: T
  weight: number
}

export interface AllocationShare<T = string> {
  key: T
  weight: number
  amount: number
}

/**
 * Ventile un montant selon des poids (pourcentage, nuitées, passagers…).
 * La somme des parts est exactement égale au montant dans la devise d'origine :
 * le reliquat d'arrondi est porté par la dernière part (règle explicite, INT03).
 */
export function allocateByWeight<T>(
  total: number,
  targets: AllocationTarget<T>[],
  currency: Currency = 'TND',
): AllocationShare<T>[] {
  if (targets.length === 0) throw new Error('Aucune cible de ventilation')
  if (targets.some((t) => !(t.weight > 0))) throw new Error('Chaque poids doit être positif')
  const weightSum = targets.reduce((a, t) => a + t.weight, 0)
  const totalMinor = toMinor(total, currency)
  let done = 0
  return targets.map((t, i) => {
    const minor = i === targets.length - 1 ? totalMinor - done : Math.round((totalMinor * t.weight) / weightSum)
    done += minor
    return { key: t.key, weight: t.weight, amount: fromMinor(minor, currency) }
  })
}

/**
 * Ventilation par nuitées : uniquement si chambres et tarifs sont identiques.
 * Sinon il faut utiliser les lignes réelles de la facture (INT03).
 */
export function allocateByNights<T>(
  total: number,
  stays: Array<{ key: T; nights: number; roomType: string; nightlyRate?: number }>,
  currency: Currency = 'TND',
): AllocationShare<T>[] {
  const rooms = new Set(stays.map((s) => s.roomType))
  const rates = new Set(stays.map((s) => s.nightlyRate ?? 'n/a'))
  if (rooms.size > 1 || rates.size > 1) {
    throw new Error('Chambres ou tarifs différents : utiliser les lignes réelles de la facture')
  }
  return allocateByWeight(total, stays.map((s) => ({ key: s.key, weight: s.nights })), currency)
}

export interface AllocationCheck {
  allocated: number
  remaining: number
  overAllocated: boolean
}

export function checkAllocation(total: number, allocations: number[], currency: Currency = 'TND'): AllocationCheck {
  const allocatedMinor = allocations.reduce((a, x) => a + toMinor(x, currency), 0)
  const totalMinor = toMinor(total, currency)
  return {
    allocated: fromMinor(allocatedMinor, currency),
    remaining: fromMinor(totalMinor - allocatedMinor, currency),
    overAllocated: allocatedMinor > totalMinor,
  }
}
