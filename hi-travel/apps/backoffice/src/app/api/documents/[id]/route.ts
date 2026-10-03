import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@hi/db/server'
import { getStaffSession } from '@/lib/auth'

/**
 * Téléchargement d’un document : l’accès est vérifié par la RLS (lecture de la fiche avec la
 * session de l’utilisateur), l’accès est journalisé, puis redirection vers une URL signée courte.
 * Aucun lien public n’est jamais produit.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.redirect(new URL('/login', request.url))
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Document inconnu', { status: 404 })
  const supabase = await createClient()
  const { data: doc } = await supabase.from('documents').select('id, title, storage_path, mime_type').eq('id', id).maybeSingle()
  if (!doc) {
    return new NextResponse('Document introuvable ou accès refusé (droits insuffisants ou pièce sensible).', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const inline = request.nextUrl.searchParams.get('inline') === '1'
  const { error: logError } = await supabase.from('document_access_log').insert({ document_id: doc.id, user_id: session.userId, action: inline ? 'view' : 'download' })
  if (logError) {
    return new NextResponse(`Accès non journalisé, téléchargement refusé : ${logError.message}`, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const ext = doc.storage_path.split('.').pop()
  const filename = `${doc.title.replace(/[^\p{L}\p{N}._ -]+/gu, '').trim() || 'document'}${ext && !doc.title.endsWith(`.${ext}`) ? `.${ext}` : ''}`
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60, inline ? undefined : { download: filename })
  if (error || !data) {
    return new NextResponse(`Fichier indisponible dans le stockage : ${error?.message ?? 'introuvable'}`, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  return NextResponse.redirect(data.signedUrl, { headers: { 'cache-control': 'no-store' } })
}
