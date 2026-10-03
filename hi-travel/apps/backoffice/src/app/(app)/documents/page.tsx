import { documentKindLabels } from '@hi/core'
import { Alert, Card, CardBody, CardHeader, Select } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { DocumentTable, type DocRow } from '@/components/ops/document-table'
import { FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, getStaff, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'

export const metadata = { title: 'Documents' }

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('documents')
  const params = await searchParams
  const q = sp(params, 'q')
  const kind = sp(params, 'type')
  const dossierQ = sp(params, 'dossier')
  const published = sp(params, 'publie')
  const supabase = await db()
  let dossierIds: string[] | null = null
  if (dossierQ) {
    const { data } = await supabase.from('dossiers').select('id').ilike('reference', ilikeValue(dossierQ)).limit(50)
    dossierIds = (data ?? []).map((d) => d.id)
  }
  // La RLS (can_read_document) masque les pièces sensibles sans le droit « identity »
  let query = supabase.from('documents').select('*, dossiers(reference), services!documents_service_id_fkey(description)')
  if (q) query = query.ilike('title', ilikeValue(q))
  if (kind) query = query.eq('kind', kind as never)
  if (published === '1') query = query.eq('published_to_client', true)
  if (published === '0') query = query.eq('published_to_client', false)
  if (dossierIds) query = query.in('dossier_id', dossierIds.length ? dossierIds : ['00000000-0000-0000-0000-000000000000'])
  const [{ data, error }, staff] = await Promise.all([query.order('created_at', { ascending: false }).limit(300), getStaff()])
  return (
    <>
      <PageHeader title="Documents" description="Documents accessibles avec vos droits. Téléchargement par lien signé de courte durée, chaque accès est journalisé ; aucun lien public." />
      {!session.can('identity') ? <Alert tone="info" className="mb-4">Les pièces d’identité et documents sensibles ne sont pas listés avec votre profil.</Alert> : null}
      <FilterBar action="/documents">
        <FilterField label="Titre"><FilterInput name="q" defaultValue={q} placeholder="Rechercher" /></FilterField>
        <FilterField label="Type">
          <Select name="type" defaultValue={kind ?? ''}><option value="">Tous</option>{Object.entries(documentKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </FilterField>
        <FilterField label="Dossier"><FilterInput name="dossier" defaultValue={dossierQ} placeholder="DOS-2026-…" /></FilterField>
        <FilterField label="Espace client">
          <Select name="publie" defaultValue={published ?? ''}><option value="">Tous</option><option value="1">Publiés</option><option value="0">Internes</option></Select>
        </FilterField>
        <ResetLink href="/documents" />
      </FilterBar>
      <Card>
        <CardHeader title={`${data?.length ?? 0} document(s)`} description={error ? `Erreur : ${error.message}` : 'Le dépôt se fait depuis l’onglet Documents du dossier.'} />
        <CardBody>
          <DocumentTable docs={(data ?? []) as DocRow[]} names={new Map(staff.map((s) => [s.id, s.full_name]))} canPublish={session.can('documents', 'update')} showDossier />
        </CardBody>
      </Card>
    </>
  )
}
