/** Utilitaires de dates et d’affichage partagés (purs, utilisables côté serveur et client). */

export const AGENCY_TZ = 'Africa/Tunis'

/** Date du jour (YYYY-MM-DD) dans le fuseau de l’agence. */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AGENCY_TZ }).format(now)
}

export function addDaysIso(d: string, days: number): string {
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/** Lundi de la semaine contenant d (YYYY-MM-DD). */
export function mondayOf(d: string): string {
  const t = new Date(`${d}T12:00:00Z`)
  const dow = (t.getUTCDay() + 6) % 7
  return addDaysIso(d, -dow)
}

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zoneParts(date, timeZone)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000
}

/** « YYYY-MM-DDTHH:mm » saisi en heure locale du fuseau → ISO UTC. */
export function zonedLocalToIso(local: string | undefined | null, timeZone = AGENCY_TZ): string | null {
  if (!local) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  let ts = guess - offsetMs(new Date(guess), timeZone)
  ts = guess - offsetMs(new Date(ts), timeZone)
  return new Date(ts).toISOString()
}

/** ISO → valeur d’un champ datetime-local, exprimée dans le fuseau donné. */
export function isoToZonedLocal(iso: string | null | undefined, timeZone = AGENCY_TZ): string {
  if (!iso) return ''
  const p = zoneParts(new Date(iso), timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}

/** Date et heure locales avec le fuseau indiqué (vols, transferts). */
export function formatInZone(iso: string | null | undefined, timeZone = AGENCY_TZ, withZone = true): string {
  if (!iso) return '—'
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
  return withZone && timeZone !== AGENCY_TZ ? `${s} (${timeZone})` : s
}

/** Temps restant lisible avant une échéance (négatif = retard). */
export function timeRemaining(dueAt: string | null | undefined, now = new Date()): { label: string; overdue: boolean } {
  if (!dueAt) return { label: 'Sans échéance', overdue: false }
  const diff = new Date(dueAt).getTime() - now.getTime()
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 3_600_000)
  const d = Math.floor(h / 24)
  const text = d >= 1 ? `${d} j${h % 24 ? ` ${h % 24} h` : ''}` : h >= 1 ? `${h} h` : `${Math.max(1, Math.floor(abs / 60_000))} min`
  return diff < 0 ? { label: `En retard de ${text}`, overdue: true } : { label: `Dans ${text}`, overdue: false }
}

export function fullName(p: { first_name?: string | null; last_name?: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ')
}

/** Lignes de texte (une par ligne) ↔ tableau. */
export function linesToArray(v: string | undefined | null): string[] {
  return (v ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
}

export function num(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

/** Lecture sûre d’un champ texte d’un objet JSON (details des prestations). */
export function detail(details: unknown, key: string): string {
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const v = (details as Record<string, unknown>)[key]
    if (v == null) return ''
    return String(v)
  }
  return ''
}

/** Instant courant en millisecondes (rendu serveur à la requête). */
export function nowMs(): number {
  return Date.now()
}
