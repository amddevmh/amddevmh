'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { documentKindLabels } from '@hi/core'
import { createClient } from '@hi/db/browser'
import { Alert, Button, Field, Input, Select } from '@hi/ui'
import { prepareDocumentUpload, registerDocument } from '@/lib/ops/actions/documents'
import { ALLOWED_MIME, MAX_BYTES, SENSITIVE_KINDS } from '@/lib/ops/documents-config'

/**
 * Dépôt d’un document de dossier : contrôle type/taille, URL de dépôt signée (bucket privé),
 * puis enregistrement de la fiche. Les pièces d’identité sont marquées sensibles automatiquement.
 */
export function DocumentUpload({ dossierId, services, travellers, canIdentity }: {
  dossierId: string
  services: Array<{ id: string; description: string }>
  travellers: Array<{ id: string; name: string }>
  canIdentity: boolean
}) {
  const router = useRouter()
  const [kind, setKind] = useState('other')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null)
  const sensitive = SENSITIVE_KINDS.includes(kind)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const file = fd.get('file')
    if (!(file instanceof File) || file.size === 0) return setMsg({ tone: 'danger', text: 'Choisir un fichier' })
    if (!ALLOWED_MIME.includes(file.type)) return setMsg({ tone: 'danger', text: `Type refusé (${file.type || 'inconnu'}) : PDF, JPEG, PNG, WebP, CSV ou Excel uniquement` })
    if (file.size > MAX_BYTES) return setMsg({ tone: 'danger', text: 'Fichier trop volumineux : 15 Mo maximum' })
    if (sensitive && !canIdentity) return setMsg({ tone: 'danger', text: 'Pièce d’identité : dépôt réservé aux profils habilités' })
    setBusy(true)
    setMsg({ tone: 'info', text: 'Préparation du dépôt…' })
    try {
      const prep = await prepareDocumentUpload({ dossierId, fileName: file.name, size: file.size, mime: file.type, kind: kind as never })
      if (!prep.ok || !prep.path || !prep.token) throw new Error(prep.error ?? 'Dépôt refusé')
      setMsg({ tone: 'info', text: 'Envoi du fichier…' })
      const { error } = await createClient().storage.from('documents').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type })
      if (error) throw new Error(`Envoi refusé : ${error.message}`)
      const res = await registerDocument({
        path: prep.path, dossierId, title: String(fd.get('title') || file.name), kind: kind as never, mime: file.type, size: file.size,
        serviceId: (fd.get('service_id') as string) || undefined, travellerId: (fd.get('traveller_id') as string) || undefined,
        publish: fd.get('publish') === 'on',
      })
      if (!res.ok) throw new Error(res.error ?? 'Enregistrement refusé')
      setMsg({ tone: 'success', text: res.message ?? 'Document enregistré' })
      form.reset()
      setKind('other')
      router.refresh()
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Échec du dépôt' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Fichier" htmlFor="doc_file" required hint="PDF, image, CSV ou Excel — 15 Mo max.">
          <Input id="doc_file" name="file" type="file" accept={ALLOWED_MIME.join(',')} className="h-auto! py-1.5" required />
        </Field>
        <Field label="Type de document" htmlFor="doc_kind">
          <Select id="doc_kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(documentKindLabels).filter(([k]) => canIdentity || !SENSITIVE_KINDS.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Titre" htmlFor="doc_title"><Input id="doc_title" name="title" placeholder="Par défaut : nom du fichier" /></Field>
        {services.length ? (
          <Field label="Prestation" htmlFor="doc_service">
            <Select id="doc_service" name="service_id" defaultValue=""><option value="">— Dossier —</option>{services.map((s) => <option key={s.id} value={s.id}>{s.description}</option>)}</Select>
          </Field>
        ) : null}
        {travellers.length ? (
          <Field label="Voyageur" htmlFor="doc_traveller">
            <Select id="doc_traveller" name="traveller_id" defaultValue=""><option value="">—</option>{travellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </Field>
        ) : null}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="publish" className="size-4" disabled={sensitive} /> Publier dans l’espace client
        </label>
      </div>
      {sensitive ? <Alert tone="warning">Document sensible : accès limité aux profils habilités, jamais publié automatiquement.</Alert> : null}
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button type="submit" disabled={busy}>{busy ? 'Dépôt en cours…' : 'Déposer le document'}</Button>
    </form>
  )
}
