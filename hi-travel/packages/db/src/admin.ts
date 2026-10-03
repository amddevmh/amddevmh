import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { supabaseEnv } from './index'

/**
 * Client « service role » : contourne la RLS. Réservé aux traitements serveur
 * (webhooks de paiement, journal des API). Ne jamais l'exposer au navigateur.
 */
export function createAdminClient() {
  const { url } = supabaseEnv()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant')
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
