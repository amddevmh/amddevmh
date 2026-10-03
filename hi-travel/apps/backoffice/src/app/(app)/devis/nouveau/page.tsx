import Link from 'next/link'
import { ACTIVITIES, activityLabels, formatDateFr, formatMoney } from '@hi/core'
import { Alert, Card, CardBody, Field, Input, Select } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { requireStaff } from '@/lib/auth'
import { createQuote } from '@/lib/ops/actions/quotes'
import { db, sp, type SearchParams } from '@/lib/ops/data'
import { addDaysIso, todayIso } from '@/lib/ops/format'

export const metadata = { title: 'Nouveau devis' }

export default async function NewQuotePage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff('quotes', 'create')
  const params = await searchParams
  const supabase = await db()
  const leadId = sp(params, 'demande')
  const { data: lead } = leadId
    ? await supabase.from('leads').select('id, reference, client_id, activity, destination, date_from, date_to, adults, children, departure_id, clients(display_name)').eq('id', leadId).maybeSingle()
    : { data: null }
  const clientId = lead?.client_id ?? sp(params, 'client')
  const departureId = lead?.departure_id ?? sp(params, 'depart')

  const [{ data: clients }, { data: departures }] = await Promise.all([
    supabase.from('clients').select('id, display_name').is('merged_into_id', null).order('display_name').limit(1000),
    supabase.from('departures').select('id, code, start_date, end_date, price_adult, capacity, seats_confirmed, seats_on_option, offers(title, activity)')
      .eq('status', 'open').gte('start_date', todayIso()).order('start_date').limit(200),
  ])
  const dep = (departures ?? []).find((d) => d.id === departureId)
  const depOffer = dep?.offers as { title?: string; activity?: string } | null | undefined
  const clientName = (lead?.clients as { display_name?: string } | null)?.display_name
  const defaultTitle = lead ? `${lead.destination ?? activityLabels[lead.activity as keyof typeof activityLabels]}${clientName ? ` — ${clientName}` : ''}` : depOffer?.title ?? ''

  return (
    <>
      <PageHeader
        title="Nouveau devis"
        description="À partir d’une demande, d’un départ (offre datée) ou vierge. Les lignes, prix et échéancier se complètent ensuite dans l’éditeur de version."
        breadcrumbs={[{ href: '/devis', label: 'Devis' }]}
      />
      {lead && !lead.client_id ? (
        <Alert tone="warning" title="Demande sans fiche client" className="mb-4">
          Rattachez d’abord la demande {lead.reference} à un client. <Link className="font-semibold underline" href={`/crm/demandes/${lead.id}`}>Ouvrir la demande</Link>
        </Alert>
      ) : null}
      <Card>
        <CardBody>
          <OpsForm action={createQuote}>
            {lead ? <input type="hidden" name="lead_id" value={lead.id} /> : null}
            {lead ? <p className="text-sm">Depuis la demande <Link className="font-medium text-brand-600 hover:underline" href={`/crm/demandes/${lead.id}`}>{lead.reference}</Link></p> : null}
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Client" htmlFor="client_id" required className="md:col-span-2">
                <Select id="client_id" name="client_id" required defaultValue={clientId ?? ''}>
                  <option value="" disabled>Choisir un client…</option>
                  {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </Select>
              </Field>
              <Field label="Activité principale" htmlFor="activity" required>
                <Select id="activity" name="activity" defaultValue={lead?.activity ?? depOffer?.activity ?? 'tailor_made'}>
                  {ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
                </Select>
              </Field>
              <Field label="Intitulé" htmlFor="title" required className="md:col-span-3"><Input id="title" name="title" defaultValue={defaultTitle} required /></Field>
              <Field label="Départ / offre datée" htmlFor="departure_id" hint="Pré-remplit les lignes forfait (adulte, enfant, bébé), inclusions et acompte" className="md:col-span-3">
                <Select id="departure_id" name="departure_id" defaultValue={departureId ?? ''}>
                  <option value="">— Aucun (devis sur mesure) —</option>
                  {(departures ?? []).map((d) => {
                    const o = d.offers as { title?: string } | null
                    return <option key={d.id} value={d.id}>{d.code} — {o?.title} — {formatDateFr(d.start_date)} — {formatMoney(d.price_adult)} / ad. — {d.capacity - d.seats_confirmed - d.seats_on_option} place(s) dispo</option>
                  })}
                </Select>
              </Field>
              <Field label="Départ" htmlFor="start_date"><Input id="start_date" name="start_date" type="date" defaultValue={lead?.date_from ?? ''} /></Field>
              <Field label="Retour" htmlFor="end_date"><Input id="end_date" name="end_date" type="date" defaultValue={lead?.date_to ?? ''} /></Field>
              <Field label="Valable jusqu’au" htmlFor="valid_until"><Input id="valid_until" name="valid_until" type="date" defaultValue={addDaysIso(todayIso(), 10)} /></Field>
              <Field label="Adultes" htmlFor="adults"><Input id="adults" name="adults" type="number" min={0} defaultValue={lead?.adults ?? 1} /></Field>
              <Field label="Enfants" htmlFor="children"><Input id="children" name="children" type="number" min={0} defaultValue={lead?.children ?? 0} /></Field>
              <Field label="Bébés" htmlFor="infants"><Input id="infants" name="infants" type="number" min={0} defaultValue={0} /></Field>
              <Field label="Langue du devis" htmlFor="language">
                <Select id="language" name="language" defaultValue="fr"><option value="fr">Français</option><option value="en">Anglais</option></Select>
              </Field>
            </div>
            <OpsSubmit>Créer le devis</OpsSubmit>
          </OpsForm>
        </CardBody>
      </Card>
    </>
  )
}
