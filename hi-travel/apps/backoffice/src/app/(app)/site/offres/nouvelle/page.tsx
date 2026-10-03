import { ACTIVITIES, activityLabels } from '@hi/core'
import { Card, CardBody, Field, Input, Select } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { requireStaff } from '@/lib/auth'
import { createOffer } from '../../actions'

export const metadata = { title: 'Nouvelle offre' }

export default async function NewOfferPage() {
  await requireStaff('site', 'create')
  return (
    <>
      <PageHeader title="Nouvelle offre" description="L’offre est créée en brouillon ; le contenu complet se saisit ensuite." breadcrumbs={[{ href: '/site/offres', label: 'Offres' }]} />
      <Card className="max-w-3xl">
        <CardBody>
          <ActionForm action={createOffer}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Titre" htmlFor="title" required className="md:col-span-2"><Input id="title" name="title" required /></Field>
              <Field label="Adresse (slug)" htmlFor="slug" required hint="ex. circuit-sud-tunisien — stable une fois publiée"><Input id="slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="font-mono" /></Field>
              <Field label="Activité" htmlFor="activity"><Select id="activity" name="activity">{ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}</Select></Field>
              <Field label="Destination" htmlFor="destination" required><Input id="destination" name="destination" required /></Field>
            </div>
            <SubmitButton>Créer le brouillon</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  )
}
