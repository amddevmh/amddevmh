import { describe, expect, it } from 'vitest'
import {
  allocateByNights, allocateByWeight, buildSchedule, checkAllocation, classifyRows, computePriority,
  computeQuoteTotals, departurePrice, formatMoney, nightsBetween, normalizeRows, parseCsv, remainingBalance,
  roundMoney, sumMoney, tripDays, type ImportTemplate,
} from './index'

describe('money', () => {
  it('works in millimes without floating point drift', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(roundMoney(1.0005)).toBe(1.001)
    expect(sumMoney(['630', '630', '630', 500])).toBe(2390)
  })
  it('formats TND with three decimals', () => {
    expect(formatMoney(2390)).toBe('2 390,000 DT')
    expect(formatMoney(null)).toBe('—')
  })
})

describe('reference scenario 2 390 DT (section 6)', () => {
  it('500 DT deposit leaves 1 890 DT; three 630 DT instalments settle the file', () => {
    expect(remainingBalance(2390, [500])).toBe(1890)
    expect(remainingBalance(2390, [500, 630, 630, 630])).toBe(0)
  })
  it('builds a schedule that reconstitutes the total exactly', () => {
    const s = buildSchedule(2390, [
      { label: 'Acompte', kind: 'deposit', amount: 500, due_date: '2026-10-05' },
      { label: 'Tranche 1', kind: 'installment', amount: 630 },
      { label: 'Tranche 2', kind: 'installment', amount: 630 },
      { label: 'Solde', kind: 'balance', days_before_departure: 15 },
    ], '2026-11-14')
    expect(s.map((i) => i.amount)).toEqual([500, 630, 630, 630])
    expect(s[3]!.dueDate).toBe('2026-10-30')
  })
  it('percent schedule: balance absorbs rounding', () => {
    const s = buildSchedule(1000, [
      { label: 'A', kind: 'deposit', percent: 33.333 },
      { label: 'B', kind: 'balance', percent: 66.667 },
    ])
    expect(sumMoney(s.map((i) => i.amount))).toBe(1000)
  })
})

describe('allocation (INT03, REC12, REC15)', () => {
  it('REC12: 600 DT split 60/40', () => {
    expect(allocateByWeight(600, [{ key: 'g1', weight: 60 }, { key: 'g2', weight: 40 }]).map((a) => a.amount)).toEqual([360, 240])
  })
  it('REC15: 3 000 DT hotel invoice split 4/3/3 nights', () => {
    const shares = allocateByNights(3000, [
      { key: 'A', nights: 4, roomType: 'Double', nightlyRate: 300 },
      { key: 'B', nights: 3, roomType: 'Double', nightlyRate: 300 },
      { key: 'C', nights: 3, roomType: 'Double', nightlyRate: 300 },
    ])
    expect(shares.map((s) => s.amount)).toEqual([1200, 900, 900])
  })
  it('refuses the nights key when rooms or rates differ', () => {
    expect(() => allocateByNights(1000, [
      { key: 'A', nights: 2, roomType: 'Double' }, { key: 'B', nights: 2, roomType: 'Suite' },
    ])).toThrow(/lignes réelles/)
  })
  it('sum of shares always equals the total (rounding remainder on the last share)', () => {
    const shares = allocateByWeight(100, [{ key: 1, weight: 1 }, { key: 2, weight: 1 }, { key: 3, weight: 1 }])
    expect(shares.map((s) => s.amount)).toEqual([33.333, 33.333, 33.334])
    expect(checkAllocation(100, shares.map((s) => s.amount))).toEqual({ allocated: 100, remaining: 0, overAllocated: false })
    expect(checkAllocation(100, [60, 50]).overAllocated).toBe(true)
  })
})

describe('pricing', () => {
  it('computes adult/child/infant prices and excludes unselected options', () => {
    const t = computeQuoteTotals([
      { paxType: 'adult', quantity: 2, unitPrice: 1000, unitCost: 900 },
      { paxType: 'child', quantity: 1, unitPrice: 800, unitCost: 700 },
      { paxType: 'infant', quantity: 1, unitPrice: 150, unitCost: 100 },
      { paxType: 'all', quantity: 1, unitPrice: 3000, unitCost: 300, fxRate: 3.39 },
      { paxType: 'all', quantity: 1, unitPrice: 350, unitCost: 200, isOptional: true },
    ])
    expect(t.totalPrice).toBe(5950)
    expect(t.totalCostTnd).toBe(1800 + 700 + 100 + 1017)
    expect(t.optionalTotal).toBe(350)
    expect(t.byPax.child).toBe(800)
  })
  it('prices a departure for a family', () => {
    expect(departurePrice({ priceAdult: 2390, priceChild: 1790, singleSupplement: 450 }, { adults: 2, children: 1 })).toBe(6570)
  })
})

describe('dates', () => {
  it('hotel nights come from stay dates, not trip duration', () => {
    expect(nightsBetween('2026-11-14', '2026-11-21')).toBe(7)
    expect(tripDays('2026-11-14', '2026-11-21')).toBe(8)
    expect(() => nightsBetween('2026-11-21', '2026-11-14')).toThrow()
  })
})

describe('priority (JOU02)', () => {
  const now = new Date('2026-10-03T08:00:00Z')
  it('red when overdue or within threshold', () => {
    expect(computePriority({ status: 'todo', dueAt: '2026-10-03T07:00:00Z' }, now).level).toBe('red')
    expect(computePriority({ status: 'todo', dueAt: '2026-10-03T10:00:00Z' }, now).reason).toMatch(/moins de 4 h/)
  })
  it('missing supplier deadline is not silently non-urgent', () => {
    expect(computePriority({ status: 'todo', dueAt: null, hasExternalDeadlineMissing: true }, now)).toEqual({ level: 'orange', reason: 'Délai fournisseur à compléter' })
  })
  it('departure tomorrow is red', () => {
    expect(computePriority({ status: 'todo', dueAt: '2026-10-10T08:00:00Z', departureDate: '2026-10-04' }, now).level).toBe('red')
  })
  it('manual priority keeps its reason', () => {
    expect(computePriority({ status: 'todo', dueAt: null, manualPriority: 'red', manualPriorityReason: 'Client VIP' }, now).reason).toContain('Client VIP')
  })
})

describe('imports (IMP01–IMP03, REC26–REC28)', () => {
  const template: ImportTemplate = {
    kind: 'ticketing', version: 1, delimiter: ',',
    columnMapping: {
      ticket_number: 'Ticket', pnr: 'PNR', passenger_name: 'Passenger', carrier: 'Airline', route: 'Route',
      start_date: 'Travel date', issue_date: 'Issue date', fare: 'Fare', taxes: 'Taxes', fees: 'Fees',
      currency: 'Currency', status: 'Status', refund_amount: 'Refund', dossier_reference: 'Booking ref',
    },
  }
  const header = 'Ticket,PNR,Passenger,Airline,Route,Travel date,Issue date,Fare,Taxes,Fees,Currency,Status,Refund,Booking ref'
  const dossiers = [{ id: 'd1', reference: 'DOS-2026-00001', travellerNames: ['ben salah'], startDate: '2026-11-14' }]

  it('parses quoted CSV', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']])
  })

  it('REC27: missing currency, invalid date and ambiguous client are reported per row', () => {
    const csv = [
      header,
      '199-1234567890,K8Q2LM,BEN SALAH/MOHAMED,TU,TUN-IST,2026-11-14,2026-10-01,700,120,10,,issued,,DOS-2026-00001',
      '199-1234567891,K8Q2LM,BEN SALAH/INES,TU,TUN-IST,31/02/2026,2026-10-01,700,120,10,TND,issued,,DOS-2026-00001',
      '199-1234567892,ZZ1ZZ1,DUPONT/JEAN,TU,TUN-PAR,2026-12-01,2026-10-01,500,90,10,TND,issued,,',
    ].join('\n')
    const { rows } = normalizeRows(csv, template)
    const classified = classifyRows(rows, new Map(), dossiers)
    expect(classified[0]!.classification).toBe('invalid')
    expect(classified[0]!.errors.map((e) => e.message)).toContain('Devise absente')
    expect(classified[1]!.classification).toBe('invalid')
    expect(classified[1]!.errors[0]!.message).toMatch(/Date invalide/)
    expect(classified[2]!.classification).toBe('ambiguous')
  })

  it('REC26/REC28: re-import creates nothing new; a refund is a linked evolution', () => {
    const csv = [header, '199-1234567890,K8Q2LM,BEN SALAH/MOHAMED,TU,TUN-IST,2026-11-14,2026-10-01,700,120,10,TND,issued,,DOS-2026-00001'].join('\n')
    const first = classifyRows(normalizeRows(csv, template).rows, new Map(), dossiers)
    expect(first[0]!.classification).toBe('new')
    expect(first[0]!.targetDossierId).toBe('d1')
    const existing = new Map([[first[0]!.externalKey!, first[0]!.normalized]])
    const again = classifyRows(normalizeRows(csv, template).rows, existing, dossiers)
    expect(again[0]!.classification).toBe('duplicate')
    const refunded = csv.replace(',issued,,', ',refunded,650,')
    const evo = classifyRows(normalizeRows(refunded, template).rows, existing, dossiers)
    expect(evo[0]!.classification).toBe('modified')
    expect(evo[0]!.diff).toMatchObject({ status: { old: 'issued', new: 'refunded' } })
  })

  it('detects duplicate lines inside one file', () => {
    const line = '199-1234567890,K8Q2LM,BEN SALAH/MOHAMED,TU,TUN-IST,2026-11-14,2026-10-01,700,120,10,TND,issued,,DOS-2026-00001'
    const r = classifyRows(normalizeRows([header, line, line].join('\n'), template).rows, new Map(), dossiers)
    expect(r.map((x) => x.classification)).toEqual(['new', 'duplicate'])
  })
})
