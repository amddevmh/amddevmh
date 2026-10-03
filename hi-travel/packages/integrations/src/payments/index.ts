/**
 * Prestataire de paiement simulé « MockPay » (FO07).
 * - Session de paiement hébergée chez le prestataire (page /mock-psp/[session] du site, qui joue ce rôle).
 * - Notification serveur signée HMAC-SHA256 : seul le résultat vérifié côté serveur crée un encaissement ;
 *   le retour navigateur ne prouve rien.
 * - Sans état : la session est un jeton signé (montant, devise, référence).
 * Pour brancher un vrai prestataire : implémenter PaymentProvider et l'exposer via getPaymentProvider().
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const MOCKPAY_CODE = 'mockpay'

export interface CheckoutSessionInput {
  intentId: string
  amount: number
  currency: string
  reference: string
  description: string
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  sessionId: string
  checkoutUrl: string
}

export interface SessionPayload {
  intentId: string
  amount: number
  currency: string
  reference: string
  description: string
  successUrl: string
  cancelUrl: string
  createdAt: string
}

export type PaymentEventType = 'payment.succeeded' | 'payment.failed' | 'payment.abandoned'

export interface PaymentEvent {
  id: string
  type: PaymentEventType
  sessionId: string
  amount: number
  currency: string
  createdAt: string
}

export interface PaymentProvider {
  readonly code: string
  createCheckoutSession(input: CheckoutSessionInput, baseUrl: string): Promise<CheckoutSession>
  verifyWebhook(rawBody: string, signatureHeader: string | null): PaymentEvent | null
}

const b64url = (s: string) => Buffer.from(s).toString('base64url')
const unb64url = (s: string) => Buffer.from(s, 'base64url').toString('utf8')

export function sign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export class MockPayProvider implements PaymentProvider {
  readonly code = MOCKPAY_CODE
  constructor(private secret: string) {
    if (!secret || secret.length < 16) throw new Error('PAYMENT_WEBHOOK_SECRET absent ou trop court')
  }

  async createCheckoutSession(input: CheckoutSessionInput, baseUrl: string): Promise<CheckoutSession> {
    const payload: SessionPayload = { ...input, createdAt: new Date().toISOString() }
    const body = b64url(JSON.stringify(payload))
    const sessionId = `cs_mock_${body}.${sign(this.secret, body).slice(0, 32)}`
    return { sessionId, checkoutUrl: `${baseUrl}/mock-psp/${encodeURIComponent(sessionId)}` }
  }

  /** Lecture d'une session par la page hébergée simulée (vérifie l'intégrité du jeton). */
  readSession(sessionId: string): SessionPayload | null {
    const m = /^cs_mock_([^.]+)\.([0-9a-f]{32})$/.exec(sessionId)
    if (!m) return null
    if (!safeEqual(sign(this.secret, m[1]!).slice(0, 32), m[2]!)) return null
    try {
      return JSON.parse(unb64url(m[1]!)) as SessionPayload
    } catch {
      return null
    }
  }

  /** Construit la notification que le prestataire enverrait au serveur (corps brut + signature). */
  buildWebhook(sessionId: string, type: PaymentEventType, eventId: string = `evt_${randomUUID()}`) {
    const session = this.readSession(sessionId)
    if (!session) throw new Error('Session de paiement invalide')
    const event: PaymentEvent = { id: eventId, type, sessionId, amount: session.amount, currency: session.currency, createdAt: new Date().toISOString() }
    const rawBody = JSON.stringify(event)
    const timestamp = Math.floor(Date.now() / 1000)
    return { rawBody, signature: `t=${timestamp},v1=${sign(this.secret, `${timestamp}.${rawBody}`)}` }
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null, toleranceSeconds = 300): PaymentEvent | null {
    if (!signatureHeader) return null
    const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=') as [string, string]))
    const t = Number(parts.t)
    if (!parts.v1 || !Number.isFinite(t)) return null
    if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return null
    if (!safeEqual(sign(this.secret, `${t}.${rawBody}`), parts.v1)) return null
    try {
      const evt = JSON.parse(rawBody) as PaymentEvent
      return evt.id && evt.type && evt.sessionId ? evt : null
    } catch {
      return null
    }
  }
}

export function getPaymentProvider(): MockPayProvider {
  return new MockPayProvider(process.env.PAYMENT_WEBHOOK_SECRET ?? '')
}
