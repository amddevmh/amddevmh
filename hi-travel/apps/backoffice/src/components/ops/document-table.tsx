import Link from 'next/link'
import { documentKindLabels, formatDateTimeFr, label } from '@hi/core'
import { Badge, EmptyState, Table, Td, Th } from '@hi/ui'
import { setDocumentPublished } from '@/lib/ops/actions/documents'
import { OpsForm, OpsSubmit } from './ops-form'

export interface DocRow {
  id: string
  title: string
  kind: string
  sensitive: boolean
  published_to_client: boolean
  size_bytes: number
  mime_type: string
  created_at: string
  uploaded_by: string | null
  uploaded_via: string
  dossier_id: string | null
  service_id: string | null
  dossiers?: { reference: string } | null
  services?: { description: string } | null
}

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`)

/** Liste de documents : téléchargement par le gestionnaire contrôlé (/api/documents/:id), jamais de lien public. */
export function DocumentTable({ docs, names, canPublish, showDossier = false }: { docs: DocRow[]; names: Map<string, string>; canPublish: boolean; showDossier?: boolean }) {
  if (!docs.length) return <EmptyState title="Aucun document" description="Aucun document accessible avec vos droits." />
  return (
    <Table className="-mx-5">
      <thead><tr><Th>Document</Th>{showDossier ? <Th>Dossier</Th> : null}<Th>Type</Th><Th>Déposé</Th><Th>Espace client</Th><Th /></tr></thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.id}>
            <Td>
              <p className="font-medium">{d.title} {d.sensitive ? <Badge tone="danger">Sensible</Badge> : null}</p>
              <p className="text-xs text-muted">{d.mime_type} · {size(d.size_bytes)}{d.services ? ` · ${d.services.description}` : ''}</p>
            </Td>
            {showDossier ? <Td>{d.dossier_id ? <Link className="text-brand-600 hover:underline" href={`/dossiers/${d.dossier_id}/documents`}>{d.dossiers?.reference ?? 'Dossier'}</Link> : '—'}</Td> : null}
            <Td>{label(documentKindLabels, d.kind)}</Td>
            <Td className="text-xs">{formatDateTimeFr(d.created_at)}<br />{d.uploaded_via === 'portal' ? 'Client (espace client)' : d.uploaded_by ? names.get(d.uploaded_by) ?? '—' : 'Système'}</Td>
            <Td>
              {d.sensitive ? <span className="text-xs text-muted">Jamais publié</span> : canPublish ? (
                <OpsForm action={setDocumentPublished} inline>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="publish" value={d.published_to_client ? '0' : '1'} />
                  <span className="flex items-center gap-2">
                    {d.published_to_client ? <Badge tone="success">Publié</Badge> : <Badge>Interne</Badge>}
                    <OpsSubmit size="sm" variant="ghost" pendingLabel="…" confirm={d.published_to_client ? undefined : 'Publier ce document dans l’espace client ?'}>{d.published_to_client ? 'Retirer' : 'Publier'}</OpsSubmit>
                  </span>
                </OpsForm>
              ) : d.published_to_client ? <Badge tone="success">Publié</Badge> : <Badge>Interne</Badge>}
            </Td>
            <Td className="whitespace-nowrap text-right">
              <a className="text-sm font-medium text-brand-600 hover:underline" href={`/api/documents/${d.id}?inline=1`} target="_blank" rel="noreferrer">Voir</a>
              {' · '}
              <a className="text-sm font-medium text-brand-600 hover:underline" href={`/api/documents/${d.id}`}>Télécharger</a>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
