'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@hi/db/server'
import type { ActionState } from '@/lib/actions'

const schema = z.object({
  email: z.email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ email: formData.get('email'), password: formData.get('password') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Saisie invalide' }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error || !data.user) return { ok: false, error: 'Identifiants incorrects' }
  const { data: profile } = await supabase.from('staff_profiles').select('active').eq('id', data.user.id).maybeSingle()
  if (!profile?.active) {
    await supabase.auth.signOut({ scope: 'local' })
    return { ok: false, error: 'Ce compte n’a pas accès au back office' }
  }
  const next = String(formData.get('next') ?? '/')
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
