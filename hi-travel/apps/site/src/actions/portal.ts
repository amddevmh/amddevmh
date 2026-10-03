'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getPaymentProvider } from '@hi/integrations/payments'
import { getPortalSession, siteUrl } from '@/lib/portal'
import type { FormState } from '@/lib/forms'
import { t } from '@/lib/i18n'

const uuid = z.guid()

/** Demande de modification / d'annulation : transmise au responsable, rien n'est annulé automatiquement (FO06). */
export async function requestChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({
    dossier_id: uuid,
    kind: z.enum(['modification', 'cancellation']),
    message: z.string().trim().min(10, 'Merci de décrire votre demande (10 caractères minimum)').max(3000, t.form.errors.tooLong),
  }).safeParse({ dossier_id: formData.get('dossier_id'), kind: formData.get('kind'), message: formData.get('message') })
  if (!parsed.success) {
    return { status: 'error', error: parsed.error.issues[0]?.message, fieldErrors: { message: parsed.error.issues[0]?.message ?? '' } }
  }
  const { supabase } = await getPortalSession()
  const { error } = await supabase.rpc('portal_request_change', {
    p_dossier_id: parsed.data.dossier_id, p_kind: parsed.data.kind, p_message: parsed.data.message,
  })
  if (error) return { status: 'error', error: error.code === 'P0001' ? error.message : t.portal.notFound }
  return { status: 'success', message: t.portal.change.success }
}

/**
 * Paiement en ligne (FO07) : création de l'intention (contrôles serveur : propriétaire, montant > 0 et ≤ solde,
 * paiement en ligne activé), session chez le prestataire, puis redirection vers sa page hébergée.
 */
export async function startPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const e = t.payment.errors
  const parsed = z.object({
    dossier_id: uuid,
    choice: z.string(),
    amount: z.string().optional(),
    accept: z.literal('on', e.conditions),
  }).safeParse({
    dossier_id: formData.get('dossier_id'), choice: formData.get('choice') ?? '', amount: formData.get('amount') ?? undefined,
    accept: formData.get('accept') ?? undefined,
  })
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? e.amount
    return { status: 'error', error: msg, fieldErrors: parsed.error.issues.some((i) => i.path[0] === 'accept') ? { accept: e.conditions } : undefined }
  }
  const { supabase } = await getPortalSession()
  const { dossier_id, choice } = parsed.data

  let scheduleItemId: string | null = null
  let amount: number
  if (choice === 'other') {
    amount = Number(String(parsed.data.amount ?? '').replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) return { status: 'error', error: e.amount, fieldErrors: { amount: e.amount } }
  } else {
    // Échéance choisie : montant restant recalculé côté serveur, jamais repris du navigateur
    const sel = choice.split(':')
    if (sel.length !== 2 || !uuid.safeParse(sel[0]).success) return { status: 'error', error: e.amount }
    scheduleItemId = sel[0]!
    amount = Number(sel[1])
    const { data: item } = await supabase.from('payment_schedule_items').select('id, amount').eq('id', scheduleItemId).eq('dossier_id', dossier_id).maybeSingle()
    if (!item || !Number.isFinite(amount) || amount <= 0 || amount > Number(item.amount)) return { status: 'error', error: e.amount }
  }
  amount = Math.round(amount * 1000) / 1000

  const { data: intent, error } = await supabase.rpc('portal_create_payment_intent', {
    p_dossier_id: dossier_id, p_schedule_item_id: scheduleItemId as string, p_amount: amount,
  })
  if (error || !intent) {
    return { status: 'error', error: error?.code === 'P0001' ? error.message : t.portal.notFound, fieldErrors: choice === 'other' ? { amount: error?.message ?? e.amount } : undefined }
  }
  const { data: dossier } = await supabase.from('portal_dossiers').select('reference').eq('id', dossier_id).single()

  let checkoutUrl: string
  try {
    const base = siteUrl()
    const session = await getPaymentProvider().createCheckoutSession({
      intentId: intent.id,
      amount: Number(intent.amount),
      currency: intent.currency,
      reference: `${dossier?.reference ?? 'HI'}-${intent.id.slice(0, 8).toUpperCase()}`,
      description: `Règlement dossier ${dossier?.reference ?? ''}`.trim(),
      successUrl: `${base}/paiement/retour?intent=${intent.id}`,
      cancelUrl: `${base}/paiement/retour?intent=${intent.id}`,
    }, base)
    const { error: attachError } = await supabase.rpc('portal_attach_payment_session', { p_intent_id: intent.id, p_session_id: session.sessionId })
    if (attachError) return { status: 'error', error: e.provider }
    checkoutUrl = session.checkoutUrl
  } catch {
    return { status: 'error', error: e.provider }
  }
  revalidatePath(`/espace-client/dossiers/${dossier_id}`)
  redirect(checkoutUrl)
}
