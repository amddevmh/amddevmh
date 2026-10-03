import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createSessionClient } from './supabase'

/**
 * Session de l'espace client. Le proxy fait un contrôle optimiste ; ici on vérifie l'utilisateur
 * auprès de Supabase et son rattachement à une fiche client. Toutes les lectures passent ensuite
 * par la RLS (portal_client_id()) : un client ne voit que ses propres dossiers.
 */
export const getPortalSession = cache(async (nextPath = '/espace-client') => {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/espace-client/connexion?next=${encodeURIComponent(nextPath)}`)
  const { data: account } = await supabase.from('client_accounts').select('client_id').eq('user_id', user.id).maybeSingle()
  if (!account) redirect('/espace-client/connexion?erreur=compte')
  return { supabase, user, clientId: account.client_id, email: user.email ?? '' }
})

/** Chemin de retour après connexion : uniquement des chemins internes de l'espace client / paiement. */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string') return '/espace-client'
  if (!/^\/(espace-client|paiement)(\/|\?|$)/.test(next) || next.startsWith('//') || next.includes('\\')) return '/espace-client'
  return next
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

/** Échéancier : affectation des montants réglés aux échéances dans l'ordre (affichage uniquement). */
export function scheduleWithStatus<T extends { amount: number; due_date: string | null }>(items: T[], paid: number, today: string) {
  let remaining = Math.round(paid * 1000)
  return items.map((it) => {
    const amount = Math.round(Number(it.amount) * 1000)
    const covered = Math.max(0, Math.min(amount, remaining))
    remaining -= covered
    const rest = (amount - covered) / 1000
    const state = rest <= 0 ? 'paid' : covered > 0 ? 'partial' : it.due_date && it.due_date < today ? 'overdue' : 'due'
    return { ...it, rest, state: state as 'paid' | 'partial' | 'overdue' | 'due' }
  })
}
