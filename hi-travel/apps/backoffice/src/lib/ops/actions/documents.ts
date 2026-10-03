'use server'

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createAdminClient } from '@hi/db/admin'
import { requireStaff } from '@/lib/auth'
import { fromDbError, type ActionState } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { ALLOWED_MIME, DOCUMENT_KINDS as KINDS, MAX_BYTES, SENSITIVE_KINDS } from '@/lib/ops/documents-config'
import { fail, NOT_ALLOWED, ok } from '@/lib/ops/server'


const prepareSchema = z.object({
  dossierId: z.guid(),
  fileName: z.string().min(1),
  size: z.number().int().positive('Fichier vide'),
  mime: z.string(),
  kind: z.enum(KINDS),
})

function safeName(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return (base || 'document').slice(-80)
}

export interface PrepareResult { ok: boolean; error?: string; path?: string; token?: string }

/**
 * Étape 1 du dépôt : contrôle du type, de la taille et des droits, puis URL de dépôt signée
 * pour le chemin `dossiers/<dossierId>/<uuid>-<fichier>` (bucket privé « documents »).
 */
export async function prepareDocumentUpload(input: z.input<typeof prepareSchema>): Promise<PrepareResult> {
  const session = await requireStaff('documents', 'create')
  const parsed = prepareSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Fichier invalide' }
  const v = parsed.data
  if (!ALLOWED_MIME.includes(v.mime)) return { ok: false, error: `Type de fichier refusé (${v.mime || 'inconnu'}) : PDF, JPEG, PNG, WebP, CSV ou Excel uniquement` }
  if (v.size > MAX_BYTES) return { ok: false, error: 'Fichier trop volumineux : 15 Mo maximum' }
  if (SENSITIVE_KINDS.includes(v.kind) && !session.can('identity', 'update')) {
    return { ok: false, error: 'Pièce d’identité : dépôt réservé aux profils habilités (données sensibles)' }
  }
  const supabase = await db()
  const { data: dossier } = await supabase.from('dossiers').select('id').eq('id', v.dossierId).maybeSingle()
  if (!dossier) return { ok: false, error: 'Dossier introuvable ou non autorisé' }
  const path = `dossiers/${v.dossierId}/${randomUUID()}-${safeName(v.fileName)}`
  const { data, error } = await supabase.storage.from('documents').createSignedUploadUrl(path)
  if (error || !data) return { ok: false, error: `Dépôt refusé par le stockage : ${error?.message ?? 'erreur inconnue'}` }
  return { ok: true, path, token: data.token }
}

const registerSchema = z.object({
  path: z.string().regex(/^dossiers\/[0-9a-f-]{36}\/[0-9a-f-]{36}-[^/]+$/, 'Chemin de dépôt invalide'),
  dossierId: z.guid(),
  title: z.string().min(2, 'Titre obligatoire'),
  kind: z.enum(KINDS),
  mime: z.string(),
  size: z.number().int().positive(),
  serviceId: z.guid().optional(),
  travellerId: z.guid().optional(),
  publish: z.boolean().default(false),
})

/** Étape 2 : enregistrement de la fiche document (RLS) et journal d’accès « upload ». */
export async function registerDocument(input: z.input<typeof registerSchema>): Promise<ActionState> {
  const session = await requireStaff('documents', 'create')
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Données invalides')
  const v = parsed.data
  if (!v.path.startsWith(`dossiers/${v.dossierId}/`)) return fail('Chemin de dépôt incohérent avec le dossier')
  if (!ALLOWED_MIME.includes(v.mime)) return fail('Type de fichier refusé')
  const supabase = await db()
  const { data: dossier } = await supabase.from('dossiers').select('id, client_id').eq('id', v.dossierId).maybeSingle()
  if (!dossier) return fail('Dossier introuvable')
  const sensitive = SENSITIVE_KINDS.includes(v.kind)
  const { data, error } = await supabase.from('documents').insert({
    kind: v.kind, title: v.title, storage_path: v.path, mime_type: v.mime, size_bytes: v.size, sensitive,
    client_id: dossier.client_id, dossier_id: v.dossierId, service_id: v.serviceId ?? null, traveller_id: v.travellerId ?? null,
    published_to_client: v.publish && !sensitive, uploaded_via: 'backoffice',
  }).select('id').single()
  if (error) {
    // Nettoyage technique du fichier orphelin (droit de dépôt vérifié ci-dessus)
    await createAdminClient().storage.from('documents').remove([v.path]).catch(() => null)
    return fromDbError(error)
  }
  await supabase.from('document_access_log').insert({ document_id: data.id, user_id: session.userId, action: 'upload' })
  return ok(sensitive ? 'Document sensible enregistré (accès restreint, jamais publié automatiquement)' : 'Document enregistré', data.id)
}

/** Publication dans l’espace client (jamais pour un document sensible). */
export async function setDocumentPublished(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('documents', 'update')
  const id = z.guid().safeParse(formData.get('id'))
  if (!id.success) return fail('Document inconnu')
  const publish = formData.get('publish') === '1'
  const supabase = await db()
  const { data, error } = await supabase.from('documents').update({ published_to_client: publish }).eq('id', id.data).select('id, published_to_client, sensitive')
  if (error) return fromDbError(error)
  if (!data?.length) return fail(NOT_ALLOWED)
  if (publish && !data[0]!.published_to_client) return fail('Document sensible : publication dans l’espace client refusée')
  await supabase.from('document_access_log').insert({ document_id: id.data, user_id: session.userId, action: publish ? 'publish' : 'unpublish' })
  return ok(publish ? 'Document publié dans l’espace client' : 'Document retiré de l’espace client')
}
