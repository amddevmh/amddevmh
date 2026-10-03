import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSessionClient } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * Téléchargement d'un document : accès vérifié avec la session du client (RLS can_read_document),
 * trace dans document_access_log, puis redirection vers une URL signée de 60 s. Jamais de lien public permanent.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!z.guid().safeParse(id).success) return new NextResponse('Document introuvable', { status: 404 })
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/espace-client/connexion'
    url.search = `?next=${encodeURIComponent('/espace-client')}`
    return NextResponse.redirect(url)
  }
  const { data: doc } = await supabase.from('documents').select('id, storage_path, title').eq('id', id).maybeSingle()
  if (!doc) return new NextResponse('Document introuvable', { status: 404 })

  const { data: signed, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60, { download: true })
  if (error || !signed) return new NextResponse('Document momentanément indisponible', { status: 404 })

  await supabase.from('document_access_log').insert({ document_id: doc.id, user_id: user.id, action: 'download' })
  const res = NextResponse.redirect(signed.signedUrl, 303)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
