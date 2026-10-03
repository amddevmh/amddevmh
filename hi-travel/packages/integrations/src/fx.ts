/**
 * Taux de change simulés (source « fx_mock »). Chaque conversion conserve taux, date et source ;
 * l'estimation se distingue de la conversion réellement réglée (section 6).
 */

export interface FxQuote {
  currency: string
  rateToTnd: number
  rateDate: string
  source: string
}

const BASE: Record<string, number> = { EUR: 3.39, USD: 3.11, SAR: 0.829, GBP: 3.98, TRY: 0.093 }

export async function getFxRate(currency: string, date: string = new Date().toISOString().slice(0, 10)): Promise<FxQuote> {
  if (currency === 'TND') return { currency, rateToTnd: 1, rateDate: date, source: 'identity' }
  const base = BASE[currency]
  if (!base) throw new Error(`Devise non prise en charge par la source simulée : ${currency}`)
  // Légère variation déterministe selon la date
  const day = Number(date.replaceAll('-', '')) % 97
  const rate = Math.round(base * (1 + (day - 48) / 10_000) * 1_000_000) / 1_000_000
  return { currency, rateToTnd: rate, rateDate: date, source: 'fx_mock' }
}
