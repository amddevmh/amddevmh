import { fromMinor, toMinor, type Currency } from './money'

export type PaxType = 'adult' | 'child' | 'infant' | 'all'

export interface QuoteLineInput {
  paxType: PaxType
  quantity: number
  unitPrice: number
  unitCost: number
  fxRate?: number
  isOptional?: boolean
  optionSelected?: boolean
}

export interface QuoteTotals {
  totalPrice: number
  totalCostTnd: number
  margin: number
  marginRate: number | null
  optionalTotal: number
  byPax: Record<PaxType, number>
}

/** Une ligne compte si elle n'est pas optionnelle, ou si l'option a été retenue. */
export function isLineIncluded(l: Pick<QuoteLineInput, 'isOptional' | 'optionSelected'>): boolean {
  return !l.isOptional || !!l.optionSelected
}

/** Totaux d'une version de devis : prix client et coûts internes séparés (mêmes règles que la vue SQL). */
export function computeQuoteTotals(lines: QuoteLineInput[], currency: Currency = 'TND'): QuoteTotals {
  let price = 0
  let cost = 0
  let optional = 0
  const byPax: Record<PaxType, number> = { adult: 0, child: 0, infant: 0, all: 0 }
  for (const l of lines) {
    const linePrice = toMinor(l.unitPrice * l.quantity, currency)
    const lineCost = toMinor(l.unitCost * (l.fxRate ?? 1) * l.quantity, currency)
    if (isLineIncluded(l)) {
      price += linePrice
      cost += lineCost
      byPax[l.paxType] += linePrice
    } else {
      optional += linePrice
    }
  }
  const totalPrice = fromMinor(price, currency)
  const totalCostTnd = fromMinor(cost, currency)
  return {
    totalPrice,
    totalCostTnd,
    margin: fromMinor(price - cost, currency),
    marginRate: price > 0 ? Math.round(((price - cost) / price) * 10000) / 100 : null,
    optionalTotal: fromMinor(optional, currency),
    byPax: {
      adult: fromMinor(byPax.adult, currency),
      child: fromMinor(byPax.child, currency),
      infant: fromMinor(byPax.infant, currency),
      all: fromMinor(byPax.all, currency),
    },
  }
}

/** Prix d'un départ pour une composition familiale. */
export function departurePrice(
  d: { priceAdult: number; priceChild?: number | null; priceInfant?: number | null; singleSupplement?: number | null },
  pax: { adults: number; children?: number; infants?: number; singles?: number },
): number {
  const minor =
    toMinor(d.priceAdult) * pax.adults +
    toMinor(d.priceChild ?? d.priceAdult) * (pax.children ?? 0) +
    toMinor(d.priceInfant ?? 0) * (pax.infants ?? 0) +
    toMinor(d.singleSupplement ?? 0) * (pax.singles ?? 0)
  return fromMinor(minor)
}

export type PriceBasis = 'per_person' | 'total' | 'from'

/**
 * Libellé public du prix : on distingue toujours prix total, prix par personne,
 * prix « à partir de » et acompte (FO02 — un acompte n'est jamais présenté comme le prix total).
 */
export function priceLabel(basis: PriceBasis): string {
  switch (basis) {
    case 'per_person':
      return 'Prix par personne'
    case 'total':
      return 'Prix total'
    case 'from':
      return 'À partir de'
  }
}
