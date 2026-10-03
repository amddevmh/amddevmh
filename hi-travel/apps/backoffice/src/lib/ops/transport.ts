import { detail } from './format'

export interface TransportLike {
  id: string
  description: string
  dossier_id: string
  start_at: string | null
  end_at: string | null
  status: string
  details: unknown
  dossier_reference?: string | null
}

export interface TransportConflict {
  a: TransportLike
  b: TransportLike
  resource: 'vehicle' | 'driver'
  value: string
}

/** Durée retenue quand l’heure de fin n’est pas saisie (estimation d’affichage uniquement). */
const DEFAULT_DURATION_MS = 2 * 3_600_000

function interval(t: TransportLike): [number, number] | null {
  if (!t.start_at) return null
  const s = Date.parse(t.start_at)
  const e = t.end_at ? Date.parse(t.end_at) : s + DEFAULT_DURATION_MS
  return [s, Math.max(e, s + 1)]
}

const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ')

/**
 * Chevauchements horaires pour un véhicule ou un chauffeur identifié (spéc. Transport).
 * Seules les prestations non annulées avec un horaire de prise en charge sont comparées.
 */
export function findTransportConflicts(items: TransportLike[]): TransportConflict[] {
  const active = items.filter((t) => t.status !== 'cancelled' && t.start_at)
  const out: TransportConflict[] = []
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!
      const b = active[j]!
      const ia = interval(a)
      const ib = interval(b)
      if (!ia || !ib || !(ia[0] < ib[1] && ib[0] < ia[1])) continue
      for (const resource of ['vehicle', 'driver'] as const) {
        const va = detail(a.details, resource)
        const vb = detail(b.details, resource)
        if (va && vb && norm(va) === norm(vb)) out.push({ a, b, resource, value: va })
      }
    }
  }
  return out
}

/** Capacité insuffisante : passagers > capacité du véhicule. */
export function capacityIssue(t: TransportLike): string | null {
  const pax = Number(detail(t.details, 'pax_count'))
  const cap = Number(detail(t.details, 'vehicle_capacity'))
  if (pax > 0 && cap > 0 && pax > cap) return `Capacité insuffisante : ${pax} passagers pour ${cap} places`
  return null
}
