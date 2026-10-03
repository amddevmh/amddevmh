import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDateTimeFr } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, CardBody, CardHeader, DefinitionList, EmptyState, Select, Stat, StatusBadge, Table, Td, Th, cn } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { requireStaff } from '@/lib/auth'
import { sp, type SearchParams } from '@/lib/fin/format'
import { cancelBatch, commitBatch, saveDecisions } from '../actions'

export const metadata = { title: 'Lot d’import' }

const CLASS_LABELS: Record<string, string> = { new: 'Nouvelle', duplicate: 'Déjà importée', modified: 'Modifiée', invalid: 'Invalide', ambiguous: 'Ambiguë' }
const DECISION: Record<string, string> = { pending: 'À décider', apply: 'Intégrer', skip: 'Ignorer' }

export default async function ImportBatchPage({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams: SearchParams }) {
  const session = await requireStaff('imports', 'read')
  const { batchId } = await params
  const filter = sp((await searchParams).class)
  const supabase = await createClient()
  const { data: batch } = await supabase.from('import_batches').select('*, import_templates(label, version), documents(storage_path)').eq('id', batchId).maybeSingle()
  if (!batch) notFound()
  const { data: rows } = await supabase.from('import_rows').select('*').eq('batch_id', batchId).order('row_number')
  const all = rows ?? []
  const ids = [...new Set(all.flatMap((r) => [...(r.candidate_dossier_ids ?? []), r.target_dossier_id]).filter((x): x is string => !!x))]
  const [{ data: refs }, { data: openDossiers }] = await Promise.all([
    ids.length ? supabase.from('dossiers').select('id, reference, title').in('id', ids) : Promise.resolve({ data: [] as Array<{ id: string; reference: string; title: string }> }),
    batch.status === 'preview' ? supabase.from('dossiers').select('id, reference, title').not('status', 'in', '(archived,cancelled)').order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] as Array<{ id: string; reference: string; title: string }> }),
  ])
  const refById = new Map([...(refs ?? []), ...(openDossiers ?? [])].map((d) => [d.id, d]))
  let signedUrl: string | null = null
  if (batch.documents?.storage_path && session.can('documents', 'read')) {
    const { data } = await supabase.storage.from('documents').createSignedUrl(batch.documents.storage_path, 120)
    signedUrl = data?.signedUrl ?? null
  }
  const stats = (batch.stats ?? {}) as Record<string, number | string | string[] | undefined>
  const count = (c: string) => all.filter((r) => r.classification === c).length
  const shown = filter ? all.filter((r) => r.classification === filter) : all
  const isPreview = batch.status === 'preview'
  const notIntegrated = all.filter((r) => !r.applied_service_id)
  const sameFile = Array.isArray(stats.same_file_batches) ? stats.same_file_batches : []

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{batch.file_name} <Badge tone={batch.status === 'committed' ? 'success' : batch.status === 'preview' ? 'warning' : 'neutral'}>{batch.status === 'committed' ? 'Intégré' : batch.status === 'preview' ? 'Prévisualisation' : 'Abandonné'}</Badge></span>}
        description={`${batch.kind === 'ticketing' ? 'Billetterie' : 'Hôtels à l’étranger'} — plateforme ${batch.platform}`}
        breadcrumbs={[{ href: `/integrations/imports?kind=${batch.kind}`, label: 'Imports de rapports' }]}
        actions={signedUrl ? <a className="text-sm text-brand-600 underline" href={signedUrl}>Télécharger le fichier source</a> : null}
      />
      {sameFile.length ? <Alert tone="warning" className="mb-4">Ce fichier (même empreinte SHA-256) a déjà été importé : les lignes déjà intégrées apparaissent comme doublons et ne seront pas recréées.</Alert> : null}

      <Card className="mb-5">
        <CardBody>
          <DefinitionList items={[
            ['Modèle', `${batch.import_templates?.label} (v${batch.import_templates?.version})`],
            ['Importé le', formatDateTimeFr(batch.created_at)],
            ['Par', String(stats.uploaded_by ?? '—')],
            ['Empreinte SHA-256', <span key="h" className="break-all font-mono text-xs">{batch.file_sha256}</span>],
            ...(batch.committed_at ? [['Intégré le', formatDateTimeFr(batch.committed_at)] as [string, string]] : []),
          ]} />
        </CardBody>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Lignes" value={all.length} href={`/integrations/imports/${batchId}`} />
        {(['new', 'modified', 'duplicate', 'invalid', 'ambiguous'] as const).map((c) => (
          <Stat key={c} label={CLASS_LABELS[c]} value={count(c)} href={`/integrations/imports/${batchId}?class=${c}`} tone={c === 'invalid' && count(c) ? 'danger' : c === 'ambiguous' && count(c) ? 'warning' : 'neutral'} />
        ))}
      </div>

      {batch.status === 'committed' ? (
        <Alert tone="success" className="mb-5" title="Rapport d’intégration">
          {String(stats.created ?? 0)} prestation(s) créée(s), {String(stats.updated ?? 0)} mise(s) à jour (historique conservé), {String(stats.skipped ?? 0)} ligne(s) non intégrée(s).
          Les prix de vente, règlements et marges restent à compléter s’ils ne sont pas fournis par le rapport.
        </Alert>
      ) : null}

      <Card className="mb-5">
        <CardHeader
          title={filter ? `Lignes « ${CLASS_LABELS[filter]} »` : 'Prévisualisation ligne à ligne'}
          description="Erreurs par ligne, différences avant mise à jour et dossiers candidats. Les lignes invalides se corrigent dans le fichier source puis se réimportent sans doublon."
        />
        {shown.length === 0 ? <EmptyState title="Aucune ligne" /> : (
          <ActionForm action={saveDecisions}>
            <input type="hidden" name="batch_id" value={batchId} />
            <Table>
              <thead><tr><Th>Ligne</Th><Th>Clé externe</Th><Th>Classement</Th><Th>Contenu</Th><Th>Erreurs / différences</Th><Th>Dossier cible</Th><Th>Décision</Th></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const n = (r.normalized ?? {}) as Record<string, string | number | null>
                  const errors = (r.errors ?? []) as Array<{ field: string; message: string }>
                  const diff = (r.diff ?? null) as Record<string, { old: unknown; new: unknown }> | null
                  const editable = isPreview && session.can('imports', 'create') && r.classification !== 'invalid' && r.classification !== 'duplicate'
                  const options = [...new Set([...(r.candidate_dossier_ids ?? []), ...(r.target_dossier_id ? [r.target_dossier_id] : [])])]
                  return (
                    <tr key={r.id} className={cn(r.classification === 'invalid' && 'bg-danger-50/40', r.classification === 'ambiguous' && 'bg-warning-50/40')}>
                      <Td className="text-xs">{r.row_number}</Td>
                      <Td className="font-mono text-xs">{r.external_key ?? '—'}</Td>
                      <Td><StatusBadge status={r.classification} labels={CLASS_LABELS} /></Td>
                      <Td className="max-w-xs text-xs">
                        <p className="font-medium text-ink">{String(n.description ?? '')}</p>
                        <p className="text-muted">{[n.start_date, n.end_date && n.end_date !== n.start_date ? `→ ${n.end_date}` : null, n.status, n.cost != null ? `${n.cost} ${n.currency ?? ''}` : null, n.dossier_reference ? `réf. ${n.dossier_reference}` : null].filter(Boolean).join(' · ')}</p>
                      </Td>
                      <Td className="max-w-xs text-xs">
                        {errors.map((e, i) => <p key={i} className="text-danger-700">{e.message}</p>)}
                        {diff ? Object.entries(diff).map(([f, d]) => <p key={f}><span className="font-mono">{f}</span> : <span className="text-muted line-through">{String(d.old ?? '∅')}</span> → <strong>{String(d.new ?? '∅')}</strong></p>) : null}
                      </Td>
                      <Td className="text-xs">
                        {editable ? (
                          <Select name={`target_${r.id}`} defaultValue={r.target_dossier_id ?? ''} aria-label="Dossier cible" className="h-8 w-52 text-xs">
                            <option value="">— Choisir —</option>
                            {options.length ? <optgroup label="Candidats">{options.map((id) => <option key={id} value={id}>{refById.get(id)?.reference ?? id}</option>)}</optgroup> : null}
                            <optgroup label="Autres dossiers">{(openDossiers ?? []).filter((d) => !options.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.reference} — {d.title.slice(0, 30)}</option>)}</optgroup>
                          </Select>
                        ) : r.target_dossier_id ? <Link className="text-brand-600 hover:underline" href={`/dossiers/${r.target_dossier_id}`}>{refById.get(r.target_dossier_id)?.reference ?? 'dossier'}</Link> : '—'}
                        {r.classification === 'ambiguous' && options.length > 1 ? <p className="mt-1 text-warning-600">{options.length} candidats : choisir explicitement</p> : null}
                        {r.classification === 'ambiguous' && options.length === 0 ? <p className="mt-1 text-warning-600">Aucun dossier rapproché (référence absente ou inconnue)</p> : null}
                      </Td>
                      <Td className="text-xs">
                        {editable ? (
                          <Select name={`decision_${r.id}`} defaultValue={r.decision} aria-label="Décision" className="h-8 w-32 text-xs">
                            {Object.entries(DECISION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </Select>
                        ) : (
                          <span>{r.applied_service_id ? <Badge tone="success">Intégrée</Badge> : <Badge>{DECISION[r.decision]}</Badge>}</span>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            {isPreview && session.can('imports', 'create') ? (
              <div className="flex justify-end px-4 pb-4"><SubmitButton variant="secondary">Enregistrer les décisions</SubmitButton></div>
            ) : null}
          </ActionForm>
        )}
      </Card>

      {isPreview ? (
        <div className="flex flex-wrap justify-end gap-3">
          {session.can('imports', 'create') ? (
            <ActionForm action={cancelBatch}>
              <input type="hidden" name="batch_id" value={batchId} />
              <SubmitButton variant="ghost" confirm="Abandonner ce lot ? Rien n’a encore été intégré.">Abandonner le lot</SubmitButton>
            </ActionForm>
          ) : null}
          {session.can('imports', 'validate') ? (
            <ActionForm action={commitBatch}>
              <input type="hidden" name="batch_id" value={batchId} />
              <SubmitButton confirm="Intégrer les lignes marquées « Intégrer » ? Les prestations seront créées ou mises à jour (historique conservé).">Intégrer le lot</SubmitButton>
            </ActionForm>
          ) : <p className="text-sm text-muted">L’intégration nécessite le droit « imports : valider ».</p>}
        </div>
      ) : null}

      {batch.status === 'committed' && notIntegrated.length ? (
        <Card className="mt-5">
          <CardHeader title="Lignes non intégrées" description="À corriger dans le fichier source puis réimporter : les lignes déjà intégrées ne seront pas dupliquées." />
          <Table>
            <thead><tr><Th>Ligne</Th><Th>Clé</Th><Th>Classement</Th><Th>Motif</Th></tr></thead>
            <tbody>
              {notIntegrated.map((r) => (
                <tr key={r.id}>
                  <Td>{r.row_number}</Td>
                  <Td className="font-mono text-xs">{r.external_key ?? '—'}</Td>
                  <Td><StatusBadge status={r.classification} labels={CLASS_LABELS} /></Td>
                  <Td className="text-xs">
                    {r.classification === 'invalid' ? ((r.errors ?? []) as Array<{ message: string }>).map((e) => e.message).join(' ; ')
                      : r.classification === 'duplicate' ? 'Déjà importée, sans changement'
                      : r.decision === 'skip' ? 'Ignorée sur décision'
                      : !r.target_dossier_id ? 'Dossier cible non choisi' : 'Décision en attente'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  )
}
