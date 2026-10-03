import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@hi/db'
import { supabaseEnv } from '@hi/db'

export { createClient as createSessionClient } from '@hi/db/server'

/**
 * Client anonyme sans session : lecture des vues publiques (site_offers, site_departures,
 * site_public_pages, app_settings publics) et soumission des demandes du site.
 * N'utilise pas les cookies : les pages publiques restent mises en cache.
 */
export function createPublicClient() {
  const { url, anonKey } = supabaseEnv()
  return createSupabaseClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
