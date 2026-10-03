import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSessionClient } from '@/lib/supabase'
import { t } from '@/lib/i18n'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED: Record<string, (b: Uint8Array) => boolean> = {
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,                 // %PDF
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
}
const KINDS = ['passport', 'id_card', 'photo', 'payment_proof', 'other'] as const

function safeName(name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+/, '')
  return (base || 'document').slice(-80)
}

/**
 * Dépôt d'une pièce par le client (FO06) : types et taille contrôlés (contenu vérifié),
 * stockage privé sous portal/<client_id>/, ligne documents « portal », notification du responsable.
 * Route Handler (et non Server Action) pour accepter des fichiers jusqu'à 10 Mo.
 */
export async function POST(request: NextRequest) {
  const u = t.portal.upload.errors
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: t.portal.notFound }, { status: 401 })
  const { data: account } = await supabase.from('client_accounts').select('client_id').eq('user_id', user.id).maybeSingle()
  if (!account) return NextResponse.json({ ok: false, error: t.portal.notFound }, { status: 403 })

  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES + 64 * 1024) return NextResponse.json({ ok: false, error: u.size }, { status: 413 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: u.failed }, { status: 400 })
  }
  const meta = z.object({
    dossier_id: z.guid(),
    kind: z.enum(KINDS),
    label: z.string().trim().max(120).optional(),
  }).safeParse({ dossier_id: form.get('dossier_id'), kind: form.get('kind') ?? 'other', label: form.get('label') || undefined })
  if (!meta.success) return NextResponse.json({ ok: false, error: u.failed }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: u.missing, field: 'file' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: u.size, field: 'file' }, { status: 413 })
  const check = ALLOWED[file.type]
  if (!check) return NextResponse.json({ ok: false, error: u.type, field: 'file' }, { status: 415 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!check(bytes)) return NextResponse.json({ ok: false, error: u.content, field: 'file' }, { status: 415 })

  // Le dossier doit être visible par ce client (RLS)
  const { data: dossier } = await supabase.from('portal_dossiers').select('id').eq('id', meta.data.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ ok: false, error: t.portal.notFound }, { status: 404 })

  const path = `portal/${account.client_id}/${randomUUID()}-${safeName(file.name)}`
  const { error: upErr } = await supabase.storage.from('documents').upload(path, bytes, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ ok: false, error: u.failed }, { status: 500 })

  const title = meta.data.label || `${t.portal.upload.kinds[meta.data.kind]} — ${file.name.slice(0, 80)}`
  const { data: doc, error: insErr } = await supabase.from('documents').insert({
    kind: meta.data.kind,
    title,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    client_id: account.client_id,
    dossier_id: dossier.id,
    uploaded_via: 'portal',
    published_to_client: false,
  }).select('id').single()
  if (insErr || !doc) return NextResponse.json({ ok: false, error: u.failed }, { status: 500 })

  // Notification du responsable du dossier (tâche dédoublonnée) + trace du dépôt
  await supabase.rpc('portal_notify_upload', { p_document_id: doc.id })
  return NextResponse.json({ ok: true, id: doc.id, message: t.portal.upload.success })
}
