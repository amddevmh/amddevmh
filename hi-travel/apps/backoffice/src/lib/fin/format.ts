/**
 * Utilitaires partagés finances / administration (purement présentationnels :
 * aucune règle comptable ou métier n'est calculée ici).
 */

/** Date du jour à Tunis (YYYY-MM-DD). */
export function todayTunis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(new Date())
}

export function firstDayOfMonth(d = todayTunis()): string {
  return `${d.slice(0, 7)}-01`
}

export function firstDayOfYear(d = todayTunis()): string {
  return `${d.slice(0, 4)}-01-01`
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(last).padStart(2, '0')}`
}

/** Saisie française « 1 234,500 » → 1234.5 ; vide → undefined ; invalide → NaN. */
export function parseAmount(v: string | null | undefined): number | undefined {
  if (v == null) return undefined
  const s = String(v).replace(/[\s  ]/g, '').replace(',', '.')
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Montant pour CSV : trois décimales, virgule décimale (Excel français). */
export function csvAmount(v: number | string | null | undefined, decimals = 3): string {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(decimals).replace('.', ',')
}

function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV séparé par des points-virgules, UTF-8 avec BOM (ouverture directe dans Excel). */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** Lecture tolérante d'un paramètre de recherche Next (string | string[] | undefined). */
export function sp(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() !== '' ? s.trim() : undefined
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>

export function isUuid(v: string | undefined | null): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export function n(v: number | string | null | undefined): number {
  return v == null || v === '' ? 0 : Number(v)
}

/** URL de retour avec message de confirmation codé (voir components/fin/notice.tsx). */
export function noticeUrl(path: string, code: string, ref?: string | null) {
  const u = new URLSearchParams({ notice: code })
  if (ref) u.set('ref', ref)
  return `${path}?${u.toString()}`
}
