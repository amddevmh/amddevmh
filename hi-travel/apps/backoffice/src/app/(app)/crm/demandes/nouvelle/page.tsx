import { ACTIVITIES, activityLabels, leadSourceLabels } from '@hi/core'
import { Card, CardBody, Field, Input, Select, Textarea } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { StaffSelect } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { createLead } from '@/lib/ops/actions/crm'
import { db, getStaff, sp, type SearchParams } from '@/lib/ops/data'

export const metadata = { title: 'Nouvelle demande' }

export default async function NewLeadPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('crm', 'create')
  const params = await searchParams
  const supabase = await db()
  const [{ data: clients }, staff] = await Promise.all([
    supabase.from('clients').select('id, display_name, email').is('merged_into_id', null).order('display_name').limit(1000),
    getStaff(),
  ])
  return (
    <>
      <PageHeader title="Nouvelle demande" breadcrumbs={[{ href: '/crm/demandes', label: 'Demandes' }]}
        description="Choisissez un client existant, ou saisissez le contact : les doublons possibles seront signalés sur la demande." />
      <Card>
        <CardBody>
          <OpsForm action={createLead} successHrefPrefix="/crm/demandes/" successLabel="Ouvrir la demande" resetOnSuccess>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Client existant" htmlFor="client_id" className="md:col-span-3">
                <Select id="client_id" name="client_id" defaultValue={sp(params, 'client') ?? ''}>
                  <option value="">— Nouveau contact (saisir ci-dessous) —</option>
                  {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.display_name}{c.email ? ` (${c.email})` : ''}</option>)}
                </Select>
              </Field>
              <Field label="Nom du contact" htmlFor="contact_name"><Input id="contact_name" name="contact_name" /></Field>
              <Field label="E-mail du contact" htmlFor="contact_email"><Input id="contact_email" name="contact_email" type="email" /></Field>
              <Field label="Téléphone du contact" htmlFor="contact_phone"><Input id="contact_phone" name="contact_phone" type="tel" /></Field>
              <Field label="Activité" htmlFor="activity" required>
                <Select id="activity" name="activity" required defaultValue="tailor_made">
                  {ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
                </Select>
              </Field>
              <Field label="Source" htmlFor="source">
                <Select id="source" name="source" defaultValue="phone">
                  {Object.entries(leadSourceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Responsable" htmlFor="owner_id"><StaffSelect staff={staff} name="owner_id" defaultValue={session.userId} /></Field>
              <Field label="Destination" htmlFor="destination"><Input id="destination" name="destination" /></Field>
              <Field label="Du" htmlFor="date_from"><Input id="date_from" name="date_from" type="date" /></Field>
              <Field label="Au" htmlFor="date_to"><Input id="date_to" name="date_to" type="date" /></Field>
              <Field label="Adultes" htmlFor="adults"><Input id="adults" name="adults" type="number" min={0} defaultValue={1} /></Field>
              <Field label="Enfants" htmlFor="children"><Input id="children" name="children" type="number" min={0} defaultValue={0} /></Field>
              <Field label="Budget (DT)" htmlFor="budget"><Input id="budget" name="budget" type="number" min={0} step="0.001" /></Field>
              <Field label="Demande" htmlFor="message" className="md:col-span-3"><Textarea id="message" name="message" /></Field>
              <Field label="Prochaine action" htmlFor="next_action" className="md:col-span-3"><Input id="next_action" name="next_action" placeholder="Ex. Rappeler pour préciser les dates" /></Field>
            </div>
            <OpsSubmit>Créer la demande</OpsSubmit>
          </OpsForm>
        </CardBody>
      </Card>
    </>
  )
}
