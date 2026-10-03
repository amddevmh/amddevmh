import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { authCookieOptions, supabaseEnv } from './index'

export function createClient() {
  const { url, anonKey } = supabaseEnv()
  return createBrowserClient<Database>(url, anonKey, { cookieOptions: authCookieOptions() })
}
