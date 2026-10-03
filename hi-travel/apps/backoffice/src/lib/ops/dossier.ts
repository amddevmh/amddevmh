import 'server-only'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { db } from './data'

/** Dossier courant (mis en cache pour la requête : partagé entre la mise en page et l’onglet). */
export const getDossier = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await db()
  const { data } = await supabase.from('dossiers').select('*, clients(id, display_name, email, phone, kind)').eq('id', id).maybeSingle()
  if (!data) notFound()
  return data
})

export const getDossierServices = cache(async (id: string) => {
  const supabase = await db()
  const { data } = await supabase.from('services').select('*, suppliers(id, name), hotels(id, name, city)').eq('dossier_id', id).order('start_date', { ascending: true, nullsFirst: false }).order('created_at')
  return data ?? []
})

/** Transitions commerciales autorisées par set_dossier_status (miroir d’affichage ; la base fait foi). */
export const DOSSIER_TRANSITIONS: Record<string, string[]> = {
  request: ['accepted', 'cancelled'],
  quote_prepared: ['accepted', 'cancelled'],
  quote_sent: ['accepted', 'cancelled'],
  accepted: ['booking', 'confirmed', 'cancelled'],
  booking: ['confirmed', 'cancelled'],
  confirmed: ['travelling', 'booking', 'cancelled'],
  travelling: ['completed'],
  completed: ['archived'],
  archived: [],
  cancelled: [],
}
