import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { authCookieOptions, supabaseEnv } from './index'

/** Client lié à la session de l'utilisateur (RLS appliquée). Server Components, actions et routes. */
export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseEnv()
  return createServerClient<Database>(url, anonKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Appel depuis un Server Component : le proxy rafraîchit la session.
        }
      },
    },
  })
}
