/**
 * Classement des urgences par règles vérifiables (JOU02) — même logique que la fonction SQL
 * `task_priority`, utilisée pour prévisualiser l'effet d'un changement de seuils (DEL03).
 */

export type PriorityLevel = 'red' | 'orange' | 'planned' | 'done'

export interface PriorityInput {
  status: string
  dueAt: string | null
  manualPriority?: PriorityLevel | null
  manualPriorityReason?: string | null
  hasExternalDeadlineMissing?: boolean
  departureDate?: string | null
  financialRisk?: boolean
}

export interface PriorityResult {
  level: PriorityLevel
  reason: string
}

const tunisDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(d)

export function computePriority(t: PriorityInput, now = new Date(), redHours = 4): PriorityResult {
  if (t.status === 'done' || t.status === 'cancelled') return { level: 'done', reason: 'Terminée' }
  if (t.manualPriority) return { level: t.manualPriority, reason: `Priorité manuelle : ${t.manualPriorityReason ?? ''}` }
  if (!t.dueAt) {
    return t.hasExternalDeadlineMissing
      ? { level: 'orange', reason: 'Délai fournisseur à compléter' }
      : { level: 'planned', reason: 'Sans échéance' }
  }
  const due = new Date(t.dueAt)
  if (due < now) return { level: 'red', reason: 'Échéance dépassée' }
  if (due.getTime() < now.getTime() + redHours * 3_600_000) return { level: 'red', reason: `Échéance dans moins de ${redHours} h` }
  if (t.departureDate) {
    const tomorrow = tunisDate(new Date(now.getTime() + 86_400_000))
    if (t.departureDate <= tomorrow) return { level: 'red', reason: 'Départ demain ou aujourd’hui' }
  }
  if (tunisDate(due) <= tunisDate(now)) {
    return { level: 'orange', reason: t.financialRisk ? 'À faire aujourd’hui — risque financier' : 'À faire aujourd’hui' }
  }
  if (t.financialRisk && due.getTime() < now.getTime() + 2 * 86_400_000) return { level: 'orange', reason: 'Risque financier approchant' }
  return { level: 'planned', reason: 'Tâche future sans risque identifié' }
}
