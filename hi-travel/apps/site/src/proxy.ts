import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Rafraîchit la session de l'espace client ; protège /espace-client (contrôle optimiste, la RLS fait foi). */
export async function proxy(request: NextRequest) {
  // Lien de réinitialisation renvoyé sur l'accueil (URL de retour hors liste autorisée) : on termine l'échange de code
  if (request.nextUrl.pathname === '/') {
    const code = request.nextUrl.searchParams.get('code')
    if (!code) return NextResponse.next()
    const next = encodeURIComponent('/espace-client/nouveau-mot-de-passe')
    // Hôte appelé (et non l'hôte normalisé) : le cookie PKCE y a été posé
    const origin = `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`
    return NextResponse.redirect(new URL(`/auth/callback?code=${encodeURIComponent(code)}&next=${next}`, origin))
  }
  let response = NextResponse.next({ request })
  const cookieName = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: cookieName ? { name: cookieName } : undefined,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  if (!user && path.startsWith('/espace-client') && !path.startsWith('/espace-client/connexion')) {
    const origin = `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`
    const next = encodeURIComponent(path + request.nextUrl.search)
    return NextResponse.redirect(new URL(`/espace-client/connexion?next=${next}`, origin))
  }
  return response
}

export const config = {
  matcher: ['/', '/espace-client/:path*', '/paiement/:path*'],
}
