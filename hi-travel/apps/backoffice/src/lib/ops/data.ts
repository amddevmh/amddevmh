import 'server-only'
import { cache } from 'react'
import { createClient } from '@hi/db/server'

export type Db = Awaited<ReturnType<typeof createClient>>

/** Client Supabase lié à la session (RLS), partagé pour la requête. */
export const db = cache(async () => createClient())

/** Collaborateurs actifs (pour affectations et affichage des noms). */
export const getStaff = cache(async () => {
  const supabase = await db()
  const { data } = await supabase.from('staff_profiles').select('id, full_name, role, active').order('full_name')
  return data ?? []
})

export async function staffNameMap(): Promise<Map<string, string>> {
  const staff = await getStaff()
  return new Map(staff.map((s) => [s.id, s.full_name]))
}

/** Fournisseurs actifs (listes de choix). */
export const getSupplierOptions = cache(async () => {
  const supabase = await db()
  const { data } = await supabase.from('suppliers').select('id, name, kind, currency').eq('active', true).order('name')
  return data ?? []
})

/** Paramètres de recherche : première valeur d’un paramètre éventuellement multiple. */
export function sp(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = params[key]
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() !== '' ? s.trim() : undefined
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Échappe une valeur pour un filtre PostgREST `ilike` dans un `or(...)`. */
export function ilikeValue(q: string): string {
  return `%${q.replace(/[%,()*\\]/g, ' ').trim()}%`
}

/** Dossiers en cours (listes de choix : tâches, échéances, options de départ). */
export const getOpenDossierOptions = cache(async () => {
  const supabase = await db()
  const { data } = await supabase.from('dossiers').select('id, reference, title, start_date, owner_id')
    .not('status', 'in', '(cancelled,archived)').order('start_date', { ascending: true, nullsFirst: false }).limit(300)
  return data ?? []
})

/** Référentiel hôtels actifs (Tunisie et étranger). */
export const getHotelOptions = cache(async () => {
  const supabase = await db()
  const { data } = await supabase.from('hotels').select('id, name, city, country').eq('active', true).order('name')
  return data ?? []
})
