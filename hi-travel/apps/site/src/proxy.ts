import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Rafraîchit la session de l'espace client ; protège /espace-client (contrôle optimiste, la RLS fait foi). */
export async function proxy(request: NextRequest) {
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
    const url = request.nextUrl.clone()
    url.pathname = '/espace-client/connexion'
    url.search = `?next=${encodeURIComponent(path)}`
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  matcher: ['/espace-client/:path*', '/paiement/:path*'],
}
