import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@hi/db/admin'
import type { Json } from '@hi/db'
import { MOCKPAY_CODE, getPaymentProvider } from '@hi/integrations/payments'

export const runtime = 'nodejs'

const SIGNATURE_HEADER = 'mockpay-signature'

/**
 * Notification serveur du prestataire de paiement (FO07, REC52).
 * Corps BRUT vérifié (HMAC) avant tout traitement ; seul un événement signé valide peut créer un encaissement,
 * via process_payment_event (idempotent par identifiant d'événement, un seul paiement par session).
 * Les notifications non signées ou falsifiées sont journalisées comme invalides.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  const signature = request.headers.get(SIGNATURE_HEADER)
  const admin = createAdminClient()
  const event = getPaymentProvider().verifyWebhook(raw, signature)

  if (!event) {
    let claimed: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') claimed = parsed as Record<string, unknown>
    } catch { /* corps illisible */ }
    // Identifiant propre à l'enregistrement invalide : un faux événement ne peut pas « réserver » l'id d'un vrai
    await admin.rpc('process_payment_event', {
      p_provider: MOCKPAY_CODE,
      p_event_id: `invalid:${randomUUID()}`,
      p_event_type: typeof claimed.type === 'string' ? claimed.type.slice(0, 60) : 'unknown',
      p_session_id: typeof claimed.sessionId === 'string' ? claimed.sessionId.slice(0, 500) : '',
      p_amount: Number(claimed.amount) || 0,
      p_payload: { claimed: raw.slice(0, 4000), signature_present: !!signature } as Json,
      p_signature_valid: false,
    })
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 400 })
  }

  const { data, error } = await admin.rpc('process_payment_event', {
    p_provider: MOCKPAY_CODE,
    p_event_id: event.id,
    p_event_type: event.type,
    p_session_id: event.sessionId,
    p_amount: event.amount,
    p_payload: event as unknown as Json,
    p_signature_valid: true,
  })
  if (error) {
    // Erreur technique : le prestataire renverra la notification (traitement idempotent)
    return NextResponse.json({ ok: false, error: 'processing_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, result: data })
}
