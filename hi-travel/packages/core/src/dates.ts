/** Dates « calendrier » au format ISO YYYY-MM-DD, sans fuseau (dates de séjour). */

const DAY = 86_400_000

function parseIsoDate(d: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) throw new Error(`Date invalide : ${d}`)
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const back = new Date(t)
  if (back.getUTCDate() !== Number(m[3])) throw new Error(`Date invalide : ${d}`)
  return t
}

export function isValidIsoDate(d: string): boolean {
  try {
    parseIsoDate(d)
    return true
  } catch {
    return false
  }
}

/**
 * Nuitées d'hôtel : calculées à partir des dates d'arrivée et de départ,
 * jamais confondues avec la durée totale du voyage.
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const n = Math.round((parseIsoDate(checkOut) - parseIsoDate(checkIn)) / DAY)
  if (n < 0) throw new Error('La date de départ précède la date d’arrivée')
  return n
}

/** Durée du voyage en jours (inclusive). */
export function tripDays(start: string, end: string): number {
  return nightsBetween(start, end) + 1
}

export function addDays(d: string, days: number): string {
  return new Date(parseIsoDate(d) + days * DAY).toISOString().slice(0, 10)
}

export function formatDateFr(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? (d.length === 10 ? new Date(`${d}T12:00:00Z`) : new Date(d)) : d
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Tunis', ...opts }).format(date)
}

export function formatDateTimeFr(d: string | Date | null | undefined, timeZone = 'Africa/Tunis'): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
  }).format(typeof d === 'string' ? new Date(d) : d)
}
