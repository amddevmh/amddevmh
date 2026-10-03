import Link from 'next/link'
import { formatDateTimeFr } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, Td, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader, Tabs } from '@/components/page'
import { requireStaff } from '@/lib/auth'
import { sp, type SearchParams } from '@/lib/fin/format'
import { uploadImport } from './actions'

export const metadata = { title: 'Imports de rapports' }

const KINDS = {
  ticketing: { label: 'Billetterie', platform: 'plateforme-billetterie', sample: '/samples/billetterie-exemple.csv', sample2: '/samples/billetterie-periode-2.csv', supplier: 'Plateforme billetterie (rapports)' },
  hotel_intl: { label: 'Hôtels à l’étranger', platform: 'plateforme-hotels-etranger', sample: '/samples/hotels-etranger-exemple.csv', sample2: '/samples/hotels-etranger-periode-2.csv', supplier: '' },
} as const
type Kind = keyof typeof KINDS
const BATCH_STATUS: Record<string, string> = { preview: 'Prévisualisation', committed: 'Intégré', cancelled: 'Abandonné' }

export default async function ImportsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('imports', 'read')
  const params = await searchParams
  const kind: Kind = sp(params.kind) === 'hotel_intl' ? 'hotel_intl' : 'ticketing'
  const k = KINDS[kind]
  const supabase = await createClient()
  const [{ data: templates }, { data: batches }, { data: suppliers }] = await Promise.all([
    supabase.from('import_templates').select('*').eq('kind', kind).order('version', { ascending: false }),
    supabase.from('import_batches').select('id, file_name, platform, status, stats, created_at, committed_at, import_templates(version)').eq('kind', kind).order('created_at', { ascending: false }).limit(30),
    session.can('suppliers', 'read') ? supabase.from('suppliers').select('id, name').order('name') : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ])
  const active = (templates ?? []).filter((t) => t.active)
  const defaultSupplier = suppliers?.find((s) => s.name === k.supplier)?.id ?? ''

  return (
    <>
      <PageHeader
        title="Imports de rapports"
        description="Un écran par type de rapport (IMP01). Le fichier est conservé, prévisualisé ligne à ligne puis intégré sur décision explicite ; un rapport de ventes ne crée jamais de facture ni d’écriture comptable."
      />
      <Tabs current={`/integrations/imports?kind=${kind}`} tabs={(Object.keys(KINDS) as Kind[]).map((x) => ({ href: `/integrations/imports?kind=${x}`, label: KINDS[x].label }))} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader title={`Téléverser un rapport — ${k.label}`} />
          <CardBody className="space-y-4">
            {session.can('imports', 'create') ? (
              active.length === 0 ? <Alert tone="warning">Aucun modèle actif pour ce type de rapport.</Alert> : (
                <ActionForm action={uploadImport}>
                  <input type="hidden" name="kind" value={kind} />
                  <Field label="Fichier CSV" htmlFor="file" required hint="Export structuré de la plateforme (UTF-8). 9,5 Mo max par lot.">
                    <Input id="file" name="file" type="file" accept=".csv,text/csv" required className="py-1.5" />
                  </Field>
                  <Field label="Modèle de correspondance" htmlFor="template_id">
                    <Select id="template_id" name="template_id">{active.map((t) => <option key={t.id} value={t.id}>{t.label} (v{t.version})</option>)}</Select>
                  </Field>
                  <Field label="Plateforme d’origine" htmlFor="platform" required hint="Clé de dédoublonnage avec la nature du mouvement : garder la même valeur d’un import à l’autre">
                    <Input id="platform" name="platform" defaultValue={k.platform} required />
                  </Field>
                  <Field label="Fournisseur (si absent du rapport)" htmlFor="supplier_id">
                    <Select id="supplier_id" name="supplier_id" defaultValue={defaultSupplier}>
                      <option value="">— Selon le rapport —</option>
                      {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  <SubmitButton pendingLabel="Analyse…">Analyser et prévisualiser</SubmitButton>
                </ActionForm>
              )
            ) : <p className="text-sm text-muted">Consultation seule.</p>}
            <div className="rounded-lg bg-canvas p-3 text-xs">
              <p className="mb-1 font-semibold text-brand-900">Fichiers exemples</p>
              <a className="block text-brand-600 underline" href={k.sample} download>Rapport exemple (1re période)</a>
              <a className="block text-brand-600 underline" href={k.sample2} download>Rapport période chevauchante (modifications, annulation/remboursement)</a>
            </div>
            {active[0] ? (
              <div className="text-xs">
                <p className="mb-1 font-semibold text-brand-900">Colonnes du modèle v{active[0].version} (séparateur « {active[0].delimiter} », dates {active[0].date_format} ou JJ/MM/AAAA)</p>
                <ul className="grid grid-cols-2 gap-x-3 text-muted">
                  {Object.entries(active[0].column_mapping as Record<string, string>).map(([f, c]) => <li key={f}><span className="font-mono text-ink">{c}</span> → {f}</li>)}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Lots importés" description="Historique : fichier, plateforme, modèle, date, utilisateur et résultat (IMP01)." />
          {(batches ?? []).length === 0 ? <EmptyState title="Aucun import" description="Téléversez le fichier exemple pour essayer." /> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Fichier</Th><Th>Plateforme</Th><Th>Modèle</Th><Th>Statut</Th><Th>Lignes</Th><Th>Résultat</Th></tr></thead>
              <tbody>
                {(batches ?? []).map((b) => {
                  const s = (b.stats ?? {}) as Record<string, number | string[] | undefined>
                  return (
                    <tr key={b.id}>
                      <Td className="whitespace-nowrap text-xs">{formatDateTimeFr(b.created_at)}</Td>
                      <Td><Link className="text-brand-600 hover:underline" href={`/integrations/imports/${b.id}`}>{b.file_name}</Link>{Array.isArray(s.same_file_batches) && s.same_file_batches.length ? <Badge tone="warning" className="ml-1">fichier déjà importé</Badge> : null}</Td>
                      <Td className="font-mono text-xs">{b.platform}</Td>
                      <Td>v{b.import_templates?.version}</Td>
                      <Td><Badge tone={b.status === 'committed' ? 'success' : b.status === 'preview' ? 'warning' : 'neutral'}>{BATCH_STATUS[b.status]}</Badge></Td>
                      <Td className="text-xs">
                        {String(s.rows ?? '')} · <span className="text-success-600">{String(s.new ?? 0)} nouv.</span> · <span className="text-info-600">{String(s.modified ?? 0)} modif.</span> · {String(s.duplicate ?? 0)} doubl. · <span className="text-danger-700">{String(s.invalid ?? 0)} inval.</span> · <span className="text-warning-600">{String(s.ambiguous ?? 0)} ambig.</span>
                      </Td>
                      <Td className="text-xs">{b.status === 'committed' ? `${String(s.created ?? 0)} créées, ${String(s.updated ?? 0)} MAJ, ${String(s.skipped ?? 0)} non intégrées` : '—'}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
