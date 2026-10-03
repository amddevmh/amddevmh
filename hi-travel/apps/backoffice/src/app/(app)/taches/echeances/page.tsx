import { Card, CardBody, CardHeader, Select } from '@hi/ui'
import { FilterBar } from '@/components/page'
import { DeadlineTable, type DeadlineRow } from '@/components/ops/deadline-table'
import { DeadlineCreateForm } from '@/components/ops/task-forms'
import { Disclosure, FilterField, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { nowMs } from '@/lib/ops/format'
import { db, getOpenDossierOptions, getStaff, sp, type SearchParams } from '@/lib/ops/data'
import { deadlineKindLabels, deadlineStatusLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Échéances fournisseurs' }

export default async function DeadlinesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('tasks')
  const params = await searchParams
  const filter = sp(params, 'filtre')
  const kind = sp(params, 'type')
  const within = sp(params, 'sous')
  const status = sp(params, 'statut') ?? 'open'

  const supabase = await db()
  let q = supabase.from('external_deadlines').select('*, dossiers(reference, title), services(description)')
  if (status !== 'toutes') q = q.eq('status', status)
  if (filter === 'a_completer') q = q.is('due_at', null)
  if (filter === 'a_reverifier') q = q.eq('needs_recheck', true)
  if (kind) q = q.eq('kind', kind)
  if (within === '48h') q = q.lt('due_at', new Date(nowMs() + 48 * 3600_000).toISOString())
  if (within === '7j') q = q.lt('due_at', new Date(nowMs() + 7 * 86400_000).toISOString())
  const [{ data, error }, dossiers, staff] = await Promise.all([
    q.order('due_at', { ascending: true, nullsFirst: true }).limit(500),
    getOpenDossierOptions(),
    getStaff(),
  ])

  return (
    <div className="space-y-5">
      {session.can('tasks', 'update') ? (
        <Disclosure summary="Nouvelle échéance contractuelle">
          <DeadlineCreateForm dossiers={dossiers} staff={staff} />
        </Disclosure>
      ) : null}
      <FilterBar action="/taches/echeances">
        <FilterField label="Affichage">
          <Select name="filtre" defaultValue={filter ?? ''}>
            <option value="">Toutes</option>
            <option value="a_completer">Délais à compléter</option>
            <option value="a_reverifier">À revérifier</option>
          </Select>
        </FilterField>
        <FilterField label="Type">
          <Select name="type" defaultValue={kind ?? ''}>
            <option value="">Tous</option>
            {Object.entries(deadlineKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Échéance">
          <Select name="sous" defaultValue={within ?? ''}>
            <option value="">Indifférent</option>
            <option value="48h">Sous 48 h (ou dépassée)</option>
            <option value="7j">Sous 7 jours (ou dépassée)</option>
          </Select>
        </FilterField>
        <FilterField label="État">
          <Select name="statut" defaultValue={status}>
            <option value="toutes">Tous</option>
            {Object.entries(deadlineStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FilterField>
        <ResetLink href="/taches/echeances" />
      </FilterBar>
      <Card>
        <CardHeader
          title={`${data?.length ?? 0} échéance(s)`}
          description={error ? `Erreur : ${error.message}` : 'Une règle interne ne remplace jamais une échéance fournisseur ; une date manquante n’est jamais estimée.'}
        />
        <CardBody>
          <DeadlineTable rows={(data ?? []) as DeadlineRow[]} canUpdate={session.can('tasks', 'update')} />
        </CardBody>
      </Card>
    </div>
  )
}
