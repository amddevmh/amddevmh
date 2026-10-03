import { createClient } from '@hi/db/server'
import { Badge, Card, CardBody, CardHeader, DateText, Field, Input, Table, Td, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { AccountingTabs } from '@/components/fin/accounting-tabs'
import { Notice } from '@/components/fin/notice'
import { requireStaff } from '@/lib/auth'
import { sp, type SearchParams } from '@/lib/fin/format'
import { closePeriod, createPeriod, reopenPeriod } from '../actions'

export const metadata = { title: 'Périodes comptables' }

export default async function PeriodsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('accounting', 'read')
  const sparams = await searchParams
  const supabase = await createClient()
  const [{ data: periods }, { data: drafts }] = await Promise.all([
    supabase.from('fiscal_periods').select('*').order('start_date', { ascending: false }),
    supabase.from('journal_entries').select('entry_date').eq('status', 'draft'),
  ])
  const draftsIn = (s: string, e: string) => (drafts ?? []).filter((d) => d.entry_date >= s && d.entry_date <= e).length

  return (
    <>
      <PageHeader title="Comptabilité" description="Une période clôturée refuse toute nouvelle écriture ; sa réouverture est réservée à un profil habilité et motivée (REC13)." />
      <Notice code={sp(sparams.notice)} refValue={sp(sparams.ref)} />
      <AccountingTabs current="/comptabilite/periodes" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Périodes" />
          <Table>
            <thead><tr><Th>Période</Th><Th>Début</Th><Th>Fin</Th><Th>Statut</Th><Th>Brouillard</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {(periods ?? []).map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">{p.label}</Td>
                  <Td><DateText value={p.start_date} /></Td>
                  <Td><DateText value={p.end_date} /></Td>
                  <Td>{p.status === 'open' ? <Badge tone="success">Ouverte</Badge> : <Badge tone="danger">Clôturée</Badge>}{p.closed_at ? <span className="block text-xs text-muted">le <DateText value={p.closed_at} /></span> : null}</Td>
                  <Td>{draftsIn(p.start_date, p.end_date) ? <Badge tone="warning">{draftsIn(p.start_date, p.end_date)} à valider</Badge> : '—'}</Td>
                  <Td>
                    {p.status === 'open' && session.can('accounting', 'validate') ? (
                      <ActionForm action={closePeriod}>
                        <input type="hidden" name="period_id" value={p.id} />
                        <SubmitButton size="sm" variant="secondary" confirm={`Clôturer la période « ${p.label} » ? Aucune écriture ne pourra plus y être validée.`}>Clôturer</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {p.status === 'closed' && session.can('settings', 'validate') ? (
                      <ActionForm action={reopenPeriod} className="w-64">
                        <input type="hidden" name="period_id" value={p.id} />
                        <Input name="reason" placeholder="Motif de réouverture (obligatoire)" required />
                        <SubmitButton size="sm" variant="danger" confirm="Rouvrir cette période ? L’opération est tracée.">Rouvrir</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {p.status === 'closed' && !session.can('settings', 'validate') ? <span className="text-xs text-muted">Réouverture : direction uniquement</span> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {session.can('accounting', 'validate') ? (
          <Card>
            <CardHeader title="Nouvelle période" />
            <CardBody>
              <ActionForm action={createPeriod} resetOnSuccess>
                <Field label="Libellé" htmlFor="label" required><Input id="label" name="label" placeholder="Exercice 2028" required /></Field>
                <Field label="Début" htmlFor="start_date" required><Input id="start_date" name="start_date" type="date" required /></Field>
                <Field label="Fin" htmlFor="end_date" required><Input id="end_date" name="end_date" type="date" required /></Field>
                <SubmitButton>Créer</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  )
}
