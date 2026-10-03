import { isValidIsoDate } from './dates'

/**
 * Imports manuels de rapports (IMP01–IMP03) : lecture CSV, normalisation selon un modèle
 * de correspondance versionné, contrôles par ligne et classement
 * nouvelles / déjà importées / modifiées / invalides / ambiguës.
 */

export type ImportKind = 'ticketing' | 'hotel_intl'
export type RowClassification = 'new' | 'duplicate' | 'modified' | 'invalid' | 'ambiguous'

export interface ImportTemplate {
  kind: ImportKind
  version: number
  delimiter: string
  columnMapping: Record<string, string>
}

export interface RowError {
  field: string
  message: string
}

export interface NormalizedRow {
  rowNumber: number
  externalKey: string | null
  raw: Record<string, string>
  normalized: Record<string, string | number | null>
  errors: RowError[]
}

export interface ClassifiedRow extends NormalizedRow {
  classification: RowClassification
  diff: Record<string, { old: unknown; new: unknown }> | null
  candidateDossierIds: string[]
  targetDossierId: string | null
}

/** Analyse CSV (RFC 4180 : guillemets, séparateurs et retours à la ligne échappés). */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

const NUMERIC_FIELDS = new Set(['fare', 'taxes', 'fees', 'cost', 'refund_amount', 'sale_price', 'rooms', 'guests'])
const DATE_FIELDS = new Set(['start_date', 'end_date', 'issue_date'])

const REQUIRED: Record<ImportKind, string[]> = {
  ticketing: ['ticket_number', 'pnr', 'passenger_name', 'start_date', 'currency', 'fare', 'status'],
  hotel_intl: ['booking_ref', 'supplier', 'hotel', 'start_date', 'end_date', 'currency', 'cost', 'status'],
}

const STATUS_MAP: Record<string, string> = {
  issued: 'issued', emis: 'issued', émis: 'issued', ticketed: 'issued',
  reissued: 'reissued', reemis: 'reissued', réémis: 'reissued',
  refunded: 'refunded', rembourse: 'refunded', remboursé: 'refunded',
  refund_requested: 'refund_expected', refund_expected: 'refund_expected',
  void: 'void', annule: 'cancelled', annulé: 'cancelled', cancelled: 'cancelled', canceled: 'cancelled',
  confirmed: 'confirmed', confirme: 'confirmed', confirmé: 'confirmed',
  pending: 'pending', 'on request': 'pending', option: 'pending',
}

function parseNumber(v: string): number | null {
  const s = v.replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Accepte YYYY-MM-DD ou DD/MM/YYYY. */
export function normalizeDate(v: string): string | null {
  const s = v.trim()
  if (s === '') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidIsoDate(s) ? s : 'invalid'
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) {
    const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
    return isValidIsoDate(iso) ? iso : 'invalid'
  }
  return 'invalid'
}

export function normalizeRows(csvText: string, template: ImportTemplate): { headers: string[]; rows: NormalizedRow[]; headerErrors: string[] } {
  const table = parseCsv(csvText, template.delimiter)
  const headers = (table[0] ?? []).map((h) => h.trim())
  const headerErrors = Object.entries(template.columnMapping)
    .filter(([field, col]) => REQUIRED[template.kind].includes(field) && !headers.includes(col))
    .map(([field, col]) => `Colonne « ${col} » absente (champ ${field})`)

  const rows = table.slice(1).map((cells, idx) => {
    const raw: Record<string, string> = {}
    headers.forEach((h, i) => (raw[h] = (cells[i] ?? '').trim()))
    const normalized: Record<string, string | number | null> = {}
    const errors: RowError[] = []

    for (const [field, col] of Object.entries(template.columnMapping)) {
      const value = raw[col] ?? ''
      if (NUMERIC_FIELDS.has(field)) {
        const n = parseNumber(value)
        if (Number.isNaN(n)) errors.push({ field, message: `Montant ou quantité invalide : « ${value} »` })
        normalized[field] = Number.isNaN(n) ? null : n
      } else if (DATE_FIELDS.has(field)) {
        const d = normalizeDate(value)
        if (d === 'invalid') errors.push({ field, message: `Date invalide : « ${value} »` })
        normalized[field] = d === 'invalid' ? null : d
      } else if (field === 'currency') {
        const c = value.toUpperCase()
        if (c && !/^[A-Z]{3}$/.test(c)) errors.push({ field, message: `Devise invalide : « ${value} »` })
        normalized[field] = c || null
      } else if (field === 'status') {
        normalized[field] = STATUS_MAP[value.toLowerCase()] ?? (value ? value.toLowerCase() : null)
      } else {
        normalized[field] = value || null
      }
    }

    for (const field of REQUIRED[template.kind]) {
      if (normalized[field] == null && !errors.some((e) => e.field === field)) {
        errors.push({
          field,
          message: field === 'currency' ? 'Devise absente' : `Champ requis manquant : ${template.columnMapping[field] ?? field}`,
        })
      }
    }
    const s = normalized.start_date
    const e = normalized.end_date
    if (typeof s === 'string' && typeof e === 'string' && e < s) {
      errors.push({ field: 'end_date', message: 'Date de fin antérieure à la date de début' })
    }

    // Clé externe stable par plateforme et nature (un PNR seul ne suffit pas)
    let externalKey: string | null = null
    if (template.kind === 'ticketing' && normalized.ticket_number) {
      externalKey = String(normalized.ticket_number).replace(/\s|-/g, '')
    } else if (template.kind === 'hotel_intl' && normalized.booking_ref && normalized.supplier) {
      externalKey = `${String(normalized.supplier).toLowerCase()}:${normalized.booking_ref}`
    }
    if (template.kind === 'ticketing') {
      normalized.description = [normalized.carrier, normalized.route, normalized.passenger_name].filter(Boolean).join(' — ') || null
      normalized.cost = sumNullable(normalized.fare, normalized.taxes)
      normalized.end_date = normalized.end_date ?? normalized.start_date ?? null
    } else {
      normalized.description = [normalized.hotel, normalized.city, normalized.room_type].filter(Boolean).join(' — ') || null
    }
    return { rowNumber: idx + 2, externalKey, raw, normalized, errors }
  })
  return { headers, rows, headerErrors }
}

function sumNullable(...v: Array<string | number | null | undefined>): number | null {
  const nums = v.filter((x): x is number => typeof x === 'number')
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) * 1000) / 1000 : null
}

const COMPARED_FIELDS = ['status', 'cost', 'fare', 'taxes', 'fees', 'refund_amount', 'start_date', 'end_date', 'room_type', 'board', 'currency', 'passenger_name']

export function diffRecords(oldData: Record<string, unknown>, newData: Record<string, unknown>) {
  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const f of COMPARED_FIELDS) {
    const a = oldData[f] ?? null
    const b = newData[f] ?? null
    if (String(a) !== String(b)) diff[f] = { old: a, new: b }
  }
  return Object.keys(diff).length ? diff : null
}

export interface DossierCandidate {
  id: string
  reference: string
  travellerNames?: string[]
  startDate?: string | null
}

/** Rattachement explicable : référence exacte d'abord, puis voyageur + date ; sinon ambiguïté présentée. */
export function matchDossier(n: Record<string, unknown>, dossiers: DossierCandidate[]): { target: string | null; candidates: string[] } {
  const ref = typeof n.dossier_reference === 'string' ? n.dossier_reference.trim().toUpperCase() : ''
  if (ref) {
    const exact = dossiers.filter((d) => d.reference.toUpperCase() === ref)
    if (exact.length === 1) return { target: exact[0]!.id, candidates: [exact[0]!.id] }
  }
  const name = String(n.passenger_name ?? n.guests ?? '').toLowerCase()
  const start = typeof n.start_date === 'string' ? n.start_date : null
  const candidates = dossiers
    .filter((d) => (start ? d.startDate === start : true) && name && (d.travellerNames ?? []).some((t) => name.includes(t.toLowerCase())))
    .map((d) => d.id)
  return { target: null, candidates }
}

export function classifyRows(
  rows: NormalizedRow[],
  existing: Map<string, Record<string, unknown>>,
  dossiers: DossierCandidate[],
): ClassifiedRow[] {
  const seen = new Set<string>()
  return rows.map((r) => {
    const { target, candidates } = matchDossier(r.normalized, dossiers)
    const base = { ...r, candidateDossierIds: candidates, targetDossierId: target, diff: null }
    if (r.errors.length || !r.externalKey) {
      return {
        ...base,
        classification: 'invalid' as const,
        errors: r.externalKey ? r.errors : [...r.errors, { field: 'external_key', message: 'Identifiant externe manquant (billet ou référence de réservation)' }],
      }
    }
    if (seen.has(r.externalKey)) {
      return { ...base, classification: 'duplicate' as const, errors: [{ field: 'external_key', message: 'Ligne en double dans le fichier' }] }
    }
    seen.add(r.externalKey)
    const prev = existing.get(r.externalKey)
    if (prev) {
      const diff = diffRecords(prev, r.normalized)
      return { ...base, diff, classification: diff ? ('modified' as const) : ('duplicate' as const) }
    }
    if (!target) return { ...base, classification: 'ambiguous' as const }
    return { ...base, classification: 'new' as const }
  })
}

export function summarize(rows: ClassifiedRow[]): Record<RowClassification, number> {
  const s: Record<RowClassification, number> = { new: 0, duplicate: 0, modified: 0, invalid: 0, ambiguous: 0 }
  for (const r of rows) s[r.classification]++
  return s
}
