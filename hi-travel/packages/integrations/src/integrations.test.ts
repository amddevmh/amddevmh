import { beforeEach, describe, expect, it } from 'vitest'
import {
  bookSafely, getFxRate, getHotelProvider, maskForLog, MockMessenger, MockPayProvider, MYGO_CODE,
  resetMockProviders, searchProviders, providerState, TUNISIABEDS_CODE, whatsappLink,
} from './index'

const params = { checkIn: '2027-07-10', checkOut: '2027-07-17', adults: 2, children: 1 }

beforeEach(() => resetMockProviders())

describe('hotel connectors (API01–API04)', () => {
  it('REC24: same hotel from both APIs, normalised but never merged', async () => {
    const outcomes = await searchProviders(
      [getHotelProvider(TUNISIABEDS_CODE, { latencyMs: 1 }), getHotelProvider(MYGO_CODE, { latencyMs: 1 })],
      (p) => ({ ...params, hotelCodes: p.code === TUNISIABEDS_CODE ? ['TB-HAM-001'] : ['MG-7781'] }),
    )
    const [a, b] = outcomes
    expect(a!.status).toBe('success')
    expect(b!.status).toBe('success')
    const tbDp = a!.offers.find((o) => o.board === 'DP')!
    const mgDp = b!.offers.find((o) => o.board === 'DP')!
    expect(tbDp.nights).toBe(7)
    expect(tbDp.provider).not.toBe(mgDp.provider)
    // Différences de taxes et conditions visibles après normalisation
    expect(tbDp.price.taxesIncluded).toBe(true)
    expect(mgDp.price.taxesIncluded).toBe(false)
    expect(mgDp.price.touristTax).toBe(3 * 7 * 2)
    expect(mgDp.boardLabelOriginal).toBe('Demi pension')
    expect(typeof mgDp.price.amount).toBe('number')
    expect(tbDp.offerRef).toContain('TB-HAM-001')
  })

  it('REC25: one API down does not block the other', async () => {
    const outcomes = await searchProviders(
      [getHotelProvider(TUNISIABEDS_CODE, { simulate: 'down' }), getHotelProvider(MYGO_CODE, { latencyMs: 1 })],
      { ...params, city: 'Hammamet' },
    )
    expect(outcomes[0]!.status).toBe('unavailable')
    expect(outcomes[1]!.status).toBe('success')
    expect(outcomes[1]!.offers.length).toBeGreaterThan(0)
  })

  it('REC25: timeout on confirmation → to verify, no second booking without a status check', async () => {
    const provider = getHotelProvider(TUNISIABEDS_CODE, { simulate: 'timeout_on_book', latencyMs: 1 })
    const req = { requestId: 'req-001', offerRef: 'x', providerHotelCode: 'TB-HAM-001', checkIn: params.checkIn, checkOut: params.checkOut, guests: [], expectedAmount: 900 }
    const first = await bookSafely(provider, req, false)
    expect(first.kind).toBe('to_verify')
    // Nouvelle tentative : le statut est contrôlé d'abord, la réservation existante est retrouvée
    const retry = await bookSafely(getHotelProvider(TUNISIABEDS_CODE, { latencyMs: 1 }), req, true)
    expect(retry.kind).toBe('booked')
    expect(retry.attempts).toBe(0)
    expect(providerState(TUNISIABEDS_CODE).bookCalls).toBe(1)
  })

  it('provider without idempotency: unknown status is never retried blindly', async () => {
    const provider = getHotelProvider(MYGO_CODE, { latencyMs: 1 })
    const out = await bookSafely(provider, { requestId: 'req-mg', offerRef: 'x', providerHotelCode: 'MG-7781', checkIn: params.checkIn, checkOut: params.checkOut, guests: [], expectedAmount: 800 }, true)
    expect(out.kind).toBe('to_verify')
    expect(providerState(MYGO_CODE).bookCalls).toBe(0)
  })

  it('price change is detected on recheck before commitment', async () => {
    const offer = (await getHotelProvider(MYGO_CODE, { latencyMs: 1 }).search({ ...params, hotelCodes: ['MG-7781'] }))[0]!
    const re = await getHotelProvider(MYGO_CODE, { simulate: 'price_change', latencyMs: 1 }).recheck(offer.offerRef, { ...params, hotelCodes: ['MG-7781'] })
    expect(re.changed).toBe(true)
    expect(re.price).toBeGreaterThan(offer.price.amount)
  })

  it('masks personal data in technical logs', () => {
    expect(maskForLog({ guests: [{ firstName: 'Mohamed' }], hotel: 'TB-HAM-001', apiKey: 'secret' })).toEqual({ guests: '***', hotel: 'TB-HAM-001', apiKey: 's***' })
  })
})

describe('mock payment provider (FO07, REC52)', () => {
  const psp = new MockPayProvider('test-secret-0123456789')
  it('round-trips a signed session and verifies webhooks', async () => {
    const s = await psp.createCheckoutSession({ intentId: 'i1', amount: 630, currency: 'TND', reference: 'DOS-1', description: 'Tranche', successUrl: '/ok', cancelUrl: '/ko' }, 'http://localhost:3000')
    expect(psp.readSession(s.sessionId)?.amount).toBe(630)
    const { rawBody, signature } = psp.buildWebhook(s.sessionId, 'payment.succeeded', 'evt_1')
    expect(psp.verifyWebhook(rawBody, signature)?.id).toBe('evt_1')
  })
  it('rejects forged bodies, bad signatures and tampered sessions', async () => {
    const s = await psp.createCheckoutSession({ intentId: 'i1', amount: 630, currency: 'TND', reference: 'DOS-1', description: '', successUrl: '', cancelUrl: '' }, '')
    const { rawBody, signature } = psp.buildWebhook(s.sessionId, 'payment.succeeded')
    expect(psp.verifyWebhook(rawBody.replace('630', '1'), signature)).toBeNull()
    expect(psp.verifyWebhook(rawBody, null)).toBeNull()
    expect(new MockPayProvider('another-secret-0123456').verifyWebhook(rawBody, signature)).toBeNull()
    expect(psp.readSession(s.sessionId.replace(/.$/, '0'))).toBeNull()
  })
})

describe('messaging and fx', () => {
  it('automatic sending stays disabled until the channel is configured', async () => {
    const r = await new MockMessenger().send({ channel: 'whatsapp', recipient: '+21628884488', body: 'x' }, { channelEnabled: false })
    expect(r.status).toBe('blocked_channel_disabled')
    expect(whatsappLink('+216 28 88 44 88', 'Bonjour')).toBe('https://wa.me/21628884488?text=Bonjour')
  })
  it('fx quotes keep rate, date and source', async () => {
    const q = await getFxRate('EUR', '2026-10-01')
    expect(q.source).toBe('fx_mock')
    expect(q.rateToTnd).toBeGreaterThan(3)
    await expect(getFxRate('XXX')).rejects.toThrow()
  })
})
