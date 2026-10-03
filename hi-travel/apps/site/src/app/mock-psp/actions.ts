'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPaymentProvider, type PaymentEventType } from '@hi/integrations/payments'

const TYPES: Record<string, PaymentEventType> = { pay: 'payment.succeeded', refuse: 'payment.failed', abandon: 'payment.abandoned' }

/**
 * Prestataire simulé : envoie la notification signée au serveur du marchand (webhook),
 * PUIS renvoie le navigateur vers l'URL de retour. Le retour navigateur ne prouve rien par lui-même.
 */
export async function pspDecision(sessionId: string, outcome: string) {
  const provider = getPaymentProvider()
  const session = provider.readSession(sessionId)
  const type = TYPES[outcome]
  if (!session || !type) redirect(`/mock-psp/${encodeURIComponent(sessionId)}?erreur=session`)
  const { rawBody, signature } = provider.buildWebhook(sessionId, type)
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  let delivered = false
  try {
    const res = await fetch(`${proto}://${host}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mockpay-signature': signature },
      body: rawBody,
      cache: 'no-store',
    })
    delivered = res.ok
  } catch {
    delivered = false
  }
  // Même si la notification échoue, le navigateur revient chez le marchand : le statut restera « en attente »
  void delivered
  redirect(type === 'payment.succeeded' ? session.successUrl : session.cancelUrl)
}
