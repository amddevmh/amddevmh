/**
 * Canaux e-mail / WhatsApp simulés. Les envois automatiques restent désactivés tant que
 * les canaux, autorisations et règles d'envoi ne sont pas configurés (section 7) :
 * un message est préparé, relu, puis « envoyé » seulement si le canal est activé.
 */

export type Channel = 'email' | 'whatsapp' | 'sms'

export interface OutgoingMessage {
  channel: Channel
  recipient: string
  subject?: string
  body: string
}

export interface SendResult {
  status: 'sent' | 'blocked_channel_disabled' | 'failed'
  providerRef: string | null
  reason?: string
}

export interface MessagingProvider {
  send(msg: OutgoingMessage, opts: { channelEnabled: boolean }): Promise<SendResult>
}

const sent: OutgoingMessage[] = []

export class MockMessenger implements MessagingProvider {
  async send(msg: OutgoingMessage, opts: { channelEnabled: boolean }): Promise<SendResult> {
    if (!opts.channelEnabled) {
      return { status: 'blocked_channel_disabled', providerRef: null, reason: `Canal ${msg.channel} non configuré : envoi automatique désactivé` }
    }
    if (msg.channel === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(msg.recipient)) {
      return { status: 'failed', providerRef: null, reason: 'Adresse e-mail invalide' }
    }
    sent.push(msg)
    return { status: 'sent', providerRef: `mock-${Date.now().toString(36)}` }
  }

  /** Pour les tests : messages « envoyés ». */
  static sentMessages() {
    return [...sent]
  }
}

/** Lien WhatsApp « click to chat » : ce n'est pas une synchronisation des conversations (FO04). */
export function whatsappLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
