import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSessionClient } from '@/lib/supabase'
import { safeNext } from '@/lib/portal'

/** Retour du lien e-mail (réinitialisation du mot de passe) : ouverture de session puis redirection interne. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const next = safeNext(url.searchParams.get('next'))
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const supabase = await createSessionClient()
  let ok = false
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error
  }
  // Redirection sur l'hôte appelé : le navigateur y retrouve les cookies de session qui viennent d'être posés
  const origin = `${url.protocol}//${request.headers.get('host') ?? url.host}`
  return NextResponse.redirect(new URL(ok ? next : '/espace-client/connexion/mot-de-passe-oublie?lien=invalide', origin), 303)
}
