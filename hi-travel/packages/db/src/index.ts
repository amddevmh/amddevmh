export type { Database, Json } from './database.types'
import type { Database } from './database.types'

type PublicSchema = Database['public']
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définis')
  }
  return { url, anonKey }
}

/**
 * Nom du cookie de session propre à chaque application (site public / back office) :
 * en local, les cookies ne distinguent pas les ports, et en production les sessions
 * client et collaborateur restent séparées.
 */
export function authCookieOptions() {
  const name = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME
  return name ? { name } : undefined
}
