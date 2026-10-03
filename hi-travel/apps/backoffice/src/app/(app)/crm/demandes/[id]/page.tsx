import Link from 'next/link'
import { notFound } from 'next/navigation'
import { activityLabels, formatDateFr, formatDateTimeFr, formatMoney, label, leadSourceLabels, leadStageLabels, quoteStatusLabels } from '@hi/core'
import { Alert, DefinitionList, EmptyState, Field, Input, Select, StatusBadge, Textarea, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { InteractionsList } from '@/components/ops/interactions'
import { Section, StaffSelect } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { attachLeadToClient, updateLead } from '@/lib/ops/actions/crm'
import { db, getStaff } from '@/lib/ops/data'
import { isoToZonedLocal } from '@/lib/ops/format'

export const metadata = { title: 'Demande' }

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('crm')
  const { id } = await params
  const supabase = await db()
  const { data: lead } = await supabase.from('leads').select('*, clients(id, display_name, email, phone)').eq('id', id).maybeSingle()
  if (!lead) notFound()
  const [staff, dups, quotes, interactions, offer] = await Promise.all([
    getStaff(),
    lead.possible_duplicate_client_ids.length
      ? supabase.from('clients').select('id, display_name, email, phone, city, created_at').in('id', lead.possible_duplicate_client_ids)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null; email: string | null; phone: string | null; city: string | null; created_at: string }> }),
    supabase.from('quotes').select('id, reference, title, status, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('interactions').select('*').eq('lead_id', id).order('occurred_at', { ascending: false }),
    lead.offer_id ? supabase.from('offers').select('id, title').eq('id', lead.offer_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const contact = (lead.contact_snapshot ?? {}) as Record<string, string | null>
  const details = (lead.details ?? {}) as Record<string, unknown>
  const canUpdate = session.can('crm', 'update')
  const client = lead.clients as { id: string; display_name: string | null; email: string | null; phone: string | null } | null
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.company || '—'

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Demande {lead.reference} <StatusBadge status={lead.stage === 'received' ? 'received_lead' : lead.stage} labels={{ ...leadStageLabels, received_lead: 'Demande reçue' }} /></span>}
        description={`${label(activityLabels, lead.activity)} — reçue le ${formatDateTimeFr(lead.created_at)} (${label(leadSourceLabels, lead.source)})`}
        breadcrumbs={[{ href: '/crm/demandes', label: 'Demandes' }]}
        actions={session.can('quotes', 'create') && client ? (
          <Link href={`/devis/nouveau?demande=${lead.id}`} className={buttonClass('accent')}>Créer un devis</Link>
        ) : null}
      />

      <div className="space-y-6">
        {!client && dups.data?.length ? (
          <Alert tone="warning" title="Doublons possibles : choisir explicitement">
            <p>Le contact de cette demande ressemble à des fiches existantes. Rattachez la demande à la bonne fiche, ou créez un nouveau client si aucune ne correspond. Aucune fusion n’est faite automatiquement.</p>
            <ul className="mt-3 space-y-2">
              {dups.data.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 p-2">
                  <div>
                    <Link href={`/crm/clients/${d.id}`} className="font-semibold underline">{d.display_name}</Link>
                    <p className="text-xs">{[d.email, d.phone, d.city].filter(Boolean).join(' · ')} — créé le {formatDateFr(d.created_at)}</p>
                  </div>
                  {canUpdate ? (
                    <OpsForm action={attachLeadToClient} inline>
                      <input type="hidden" name="id" value={lead.id} />
                      <input type="hidden" name="client_id" value={d.id} />
                      <OpsSubmit size="sm" variant="secondary" confirm={`Rattacher la demande à « ${d.display_name} » ?`}>Rattacher à ce client</OpsSubmit>
                    </OpsForm>
                  ) : null}
                </li>
              ))}
            </ul>
            {session.can('crm', 'create') ? (
              <Link href={`/crm/clients/nouveau?demande=${lead.id}`} className={buttonClass('secondary', 'sm', 'mt-3')}>Aucune ne correspond : créer un nouveau client</Link>
            ) : null}
          </Alert>
        ) : null}
        {!client && !dups.data?.length ? (
          <Alert tone="info" title="Demande sans fiche client">
            Créez la fiche client pour pouvoir établir un devis.{' '}
            {session.can('crm', 'create') ? <Link className="font-semibold underline" href={`/crm/clients/nouveau?demande=${lead.id}`}>Créer la fiche client</Link> : null}
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Demande" className="lg:col-span-2">
            <DefinitionList items={[
              ['Client', client ? <Link className="text-brand-600 hover:underline" href={`/crm/clients/${client.id}`}>{client.display_name}</Link> : <span className="text-warning-600">Non rattachée</span>],
              ['Contact saisi', <span key="c">{contactName}<br /><span className="text-xs text-muted">{[contact.email, contact.phone].filter(Boolean).join(' · ')}</span></span>],
              ['Destination', lead.destination],
              ['Dates', lead.date_from ? `${formatDateFr(lead.date_from)}${lead.date_to ? ` → ${formatDateFr(lead.date_to)}` : ''}${lead.flexible_dates ? ' (flexibles)' : ''}` : 'À préciser'],
              ['Voyageurs', `${lead.adults} adulte(s)${lead.children ? `, ${lead.children} enfant(s)${lead.children_ages.length ? ` (${lead.children_ages.join(', ')} ans)` : ''}` : ''}`],
              ['Budget', lead.budget != null ? formatMoney(lead.budget, lead.currency) : null],
              ['Offre demandée', offer.data ? offer.data.title : null],
              ['Consentements', <span key="cs">{lead.processing_consent ? 'Traitement : oui' : 'Traitement : non'} · {lead.marketing_consent ? 'Prospection : oui' : 'Prospection : non'}</span>],
            ]} />
            {lead.message ? <p className="mt-4 whitespace-pre-line rounded-lg bg-canvas p-3 text-sm">{lead.message}</p> : null}
            {Object.keys(details).length ? (
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Précisions</p>
                <DefinitionList items={Object.entries(details).map(([k, v]) => [k, String(v)])} />
              </div>
            ) : null}
          </Section>

          <Section title="Suivi commercial">
            {canUpdate ? (
              <OpsForm action={updateLead}>
                <input type="hidden" name="id" value={lead.id} />
                <Field label="Étape" htmlFor="stage">
                  <Select id="stage" name="stage" defaultValue={lead.stage}>
                    {Object.entries(leadStageLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Responsable" htmlFor="owner_id"><StaffSelect staff={staff} name="owner_id" defaultValue={lead.owner_id} /></Field>
                <Field label="Motif de perte" htmlFor="lost_reason" hint="Obligatoire si la demande est perdue"><Input id="lost_reason" name="lost_reason" defaultValue={lead.lost_reason ?? ''} /></Field>
                <Field label="Prochaine action" htmlFor="next_action"><Textarea id="next_action" name="next_action" defaultValue={lead.next_action ?? ''} className="min-h-14!" /></Field>
                <Field label="Pour le" htmlFor="next_action_at"><Input id="next_action_at" name="next_action_at" type="datetime-local" defaultValue={isoToZonedLocal(lead.next_action_at)} /></Field>
                <OpsSubmit>Enregistrer</OpsSubmit>
              </OpsForm>
            ) : (
              <DefinitionList className="sm:grid-cols-1" items={[
                ['Responsable', lead.owner_id ? names.get(lead.owner_id) : 'À attribuer'],
                ['Prochaine action', lead.next_action],
                ['Motif de perte', lead.lost_reason],
              ]} />
            )}
          </Section>
        </div>

        <Section title="Devis liés" actions={session.can('quotes', 'create') && client ? <Link href={`/devis/nouveau?demande=${lead.id}`} className={buttonClass('secondary', 'sm')}>Nouveau devis</Link> : null}>
          {quotes.data?.length ? (
            <ul className="divide-y divide-line">
              {quotes.data.map((q) => (
                <li key={q.id} className="flex items-center justify-between py-2">
                  <Link href={`/devis/${q.id}`} className="font-medium text-brand-600 hover:underline">{q.reference} — {q.title}</Link>
                  <StatusBadge status={q.status} labels={quoteStatusLabels} />
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Aucun devis" />}
        </Section>

        <Section title="Échanges consignés">
          <InteractionsList rows={interactions.data ?? []} names={names} target={{ lead_id: lead.id, client_id: client?.id }} canAdd={session.can('crm', 'create')} />
        </Section>
      </div>
    </>
  )
}
