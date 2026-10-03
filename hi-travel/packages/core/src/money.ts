/**
 * Montants : la base stocke numeric(14,3). Côté TypeScript on calcule en millimes
 * (entiers) pour éviter les erreurs de virgule flottante, TND à trois décimales.
 */

export type Currency = 'TND' | 'EUR' | 'USD' | 'SAR' | (string & {})

const DECIMALS: Record<string, number> = { TND: 3 }

export function decimalsFor(currency: Currency): number {
  return DECIMALS[currency] ?? 2
}

/** Convertit un montant décimal (number | string) en millimes entiers. */
export function toMinor(amount: number | string, currency: Currency = 'TND'): number {
  const n = typeof amount === 'string' ? Number(amount.replace(/\s/g, '').replace(',', '.')) : amount
  if (!Number.isFinite(n)) throw new Error(`Montant invalide : ${amount}`)
  const factor = 10 ** decimalsFor(currency)
  return Math.round(n * factor)
}

export function fromMinor(minor: number, currency: Currency = 'TND'): number {
  return minor / 10 ** decimalsFor(currency)
}

/** Arrondi à la précision de la devise (3 décimales pour le TND). */
export function roundMoney(amount: number, currency: Currency = 'TND'): number {
  return fromMinor(toMinor(amount, currency), currency)
}

export function sumMoney(amounts: Array<number | string | null | undefined>, currency: Currency = 'TND'): number {
  return fromMinor(
    amounts.reduce<number>((acc, a) => acc + (a == null || a === '' ? 0 : toMinor(a, currency)), 0),
    currency,
  )
}

const formatters = new Map<string, Intl.NumberFormat>()

/** Format français : « 2 390,000 DT ». */
export function formatMoney(amount: number | string | null | undefined, currency: Currency = 'TND'): string {
  if (amount == null || amount === '') return '—'
  const n = typeof amount === 'string' ? Number(amount) : amount
  const d = decimalsFor(currency)
  const key = `${currency}:${d}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
    formatters.set(key, f)
  }
  const symbol = currency === 'TND' ? 'DT' : currency
  // Espace insécable fine → espace insécable simple pour un rendu homogène
  return `${f.format(n).replace(/ /g, ' ')} ${symbol}`
}

/** Conversion vers le TND avec taux daté. */
export function convertToTnd(amount: number, rateToTnd: number): number {
  if (rateToTnd <= 0) throw new Error('Taux de change invalide')
  return roundMoney(amount * rateToTnd, 'TND')
}
