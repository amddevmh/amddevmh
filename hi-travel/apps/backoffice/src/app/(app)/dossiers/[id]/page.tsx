import Link from 'next/link'
import { dossierStatusLabels, formatDateFr, formatDateTimeFr, label, serviceStatusLabels } from '@hi/core'
import { Alert, Badge, DefinitionList, Field, Input, Money, Textarea, buttonClass } from '@hi/ui'
import { InteractionsList } from '@/components/ops/interactions'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { Disclosure, Section, StaffSelect } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { confirmDossierAction, setDossierStatusAction, updateDossierInfo } from '@/lib/ops/actions/dossiers'
import { db, getStaff } from '@/lib/ops/data'
import { DOSSIER_TRANSITIONS, getDossier, getDossierServices } from '@/lib/ops/dossier'
import { financialStatusLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Dossier — synthèse' }

export default async function DossierSummary({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('dossiers')
  const { id } = await params
  const d = await getDossier(id)
  const supabase = await db()
  const [services, staff, { data: fin }, { data: blockers }, { data: interactions }, quote, departure] = await Promise.all([
    getDossierServices(id),
    getStaff(),
    supabase.from('dossier_financials').select('*').eq('dossier_id', id).maybeSingle(),
    ['accepted', 'booking'].includes(d.status) ? supabase.rpc('dossier_confirmation_blockers', { p_dossier_id: id }) : Promise.resolve({ data: [] as Array<{ code: string; message: string }> }),
    supabase.from('interactions').select('*').eq('dossier_id', id).order('occurred_at', { ascending: false }).limit(30),
    d.quote_id ? supabase.from('quotes').select('id, reference').eq('id', d.quote_id).maybeSingle() : Promise.resolve({ data: null }),
    d.departure_id ? supabase.from('departures').select('id, code').eq('id', d.departure_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const canUpdate = session.can('dossiers', 'update')
  const canValidate = session.can('dossiers', 'validate')
  const canMargins = session.can('margins')
  const transitions = (DOSSIER_TRANSITIONS[d.status] ?? []).filter((s) => s !== 'confirmed' && s !== 'cancelled')
  const active = services.filter((s) => s.status !== 'cancelled')
  const byStatus = (st: string) => active.filter((s) => s.status === st).length
  const toReview = services.filter((s) => s.needs_review)
  const client = d.clients as { id: string; display_name: string | null; email: string | null; phone: string | null } | null

  // Statut de paiement : distinct du parcours commercial et des prestations
  const sale = Number(fin?.sale_net ?? d.total_price)
  const paid = Number(fin?.paid ?? 0)
  const overdue = Number(fin?.overdue ?? 0)
  const paymentState = paid <= 0 ? (overdue > 0 ? { t: 'Aucun encaissement — échéance dépassée', tone: 'danger' as const } : { t: 'Aucun encaissement', tone: 'neutral' as const })
    : paid >= sale ? { t: 'Soldé', tone: 'success' as const }
      : overdue > 0 ? { t: 'Partiellement payé — retard', tone: 'danger' as const } : { t: 'Partiellement payé — conforme à l’échéancier', tone: 'warning' as const }

  return (
    <div className="space-y-6">
      {d.derogation_reason ? (
        <Alert tone="warning" title="Confirmé par dérogation">
          {d.derogation_reason} — {d.derogation_by ? names.get(d.derogation_by) : ''} le {formatDateTimeFr(d.derogation_at)}
        </Alert>
      ) : null}
      {d.status === 'cancelled' && d.cancelled_reason ? <Alert tone="danger" title="Dossier annulé">{d.cancelled_reason}</Alert> : null}
      {toReview.length ? (
        <Alert tone="danger" title="Prestations liées à revoir">
          {toReview.map((s) => <p key={s.id}><Link className="font-semibold underline" href={`/dossiers/${id}/prestations/${s.id}`}>{s.description}</Link> — {s.review_reason}</p>)}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Statut commercial" description="Demande → Devis → Accepté → En réservation → Confirmé → En voyage → Terminé → Archivé" className="xl:col-span-2">
          <p className="mb-3 text-sm">Statut actuel : <strong>{label(dossierStatusLabels, d.status)}</strong></p>
          {['accepted', 'booking'].includes(d.status) ? (
            <div className="mb-4 rounded-lg border border-line p-3">
              <p className="mb-2 text-sm font-semibold text-brand-900">Confirmation du dossier</p>
              {blockers?.length ? (
                <Alert tone="warning" title="Prérequis non remplis">
                  <ul className="list-disc pl-5">{blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul>
                  <p className="mt-1 text-xs">Une dérogation doit être autorisée et motivée ; elle ne remplace jamais un document obligatoire.</p>
                </Alert>
              ) : <Alert tone="success">Prestations obligatoires confirmées, documents présents et acompte satisfait.</Alert>}
              {canUpdate ? (
                <OpsForm action={confirmDossierAction} className="mt-3">
                  <input type="hidden" name="dossier_id" value={id} />
                  {blockers?.length && canValidate ? (
                    <Field label="Motif de dérogation (direction / validation)" htmlFor="derogation_reason" hint="Obligatoire pour confirmer malgré les prérequis non remplis">
                      <Input id="derogation_reason" name="derogation_reason" />
                    </Field>
                  ) : null}
                  <OpsSubmit variant="accent" confirm="Confirmer le dossier ?">{blockers?.length ? (canValidate ? 'Confirmer (avec dérogation motivée)' : 'Tenter la confirmation') : 'Confirmer le dossier'}</OpsSubmit>
                </OpsForm>
              ) : null}
            </div>
          ) : null}
          {canUpdate && (transitions.length || (DOSSIER_TRANSITIONS[d.status] ?? []).includes('cancelled')) ? (
            <div className="flex flex-wrap items-start gap-3">
              {transitions.map((s) => (
                <OpsForm key={s} action={setDossierStatusAction} inline>
                  <input type="hidden" name="dossier_id" value={id} />
                  <input type="hidden" name="status" value={s} />
                  <OpsSubmit variant="secondary" size="sm" confirm={`Passer le dossier en « ${dossierStatusLabels[s]} » ?`}>→ {dossierStatusLabels[s]}</OpsSubmit>
                </OpsForm>
              ))}
              {(DOSSIER_TRANSITIONS[d.status] ?? []).includes('cancelled') ? (
                <Disclosure summary="Annuler le dossier…">
                  <OpsForm action={setDossierStatusAction}>
                    <input type="hidden" name="dossier_id" value={id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <Field label="Motif d’annulation" htmlFor="reason" required><Input id="reason" name="reason" /></Field>
                    <OpsSubmit variant="danger" confirm="Annuler ce dossier ? Les prestations et paiements restent à traiter séparément.">Annuler le dossier</OpsSubmit>
                  </OpsForm>
                </Disclosure>
              ) : null}
            </div>
          ) : null}
          {d.status === 'completed' && !['closed', 'closed_with_exception'].includes(d.financial_status) ? (
            <p className="mt-3 text-xs text-muted">L’archivage n’est possible qu’après la clôture financière (réalisée par la finance).</p>
          ) : null}
        </Section>

        <Section title="Prestations">
          <ul className="space-y-1 text-sm">
            {(['requested', 'option', 'confirmed'] as const).map((st) => (
              <li key={st} className="flex justify-between"><span>{serviceStatusLabels[st]}</span><Badge tone={st === 'confirmed' ? 'success' : st === 'option' ? 'warning' : 'neutral'}>{byStatus(st)}</Badge></li>
            ))}
            <li className="flex justify-between text-muted"><span>Annulées</span><span>{services.length - active.length}</span></li>
            {toReview.length ? <li className="flex justify-between text-danger-700"><span>À revoir</span><span>{toReview.length}</span></li> : null}
          </ul>
          <Link href={`/dossiers/${id}/prestations`} className={buttonClass('secondary', 'sm', 'mt-3')}>Gérer les prestations</Link>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Situation de paiement" description="Distincte du statut commercial et des prestations.">
          <p className="mb-3"><Badge tone={paymentState.tone}>{paymentState.t}</Badge></p>
          <DefinitionList className="sm:grid-cols-2" items={[
            ['Prix de vente', <Money key="s" value={fin?.sale_planned ?? d.total_price} />],
            ['Avoirs', <Money key="c" value={fin?.credit_notes ?? 0} />],
            ['Encaissé (validé)', <Money key="p" value={paid} />],
            ['Solde client', <Money key="b" value={fin?.balance} />],
            ['Échu non payé', <Money key="o" value={overdue} className={overdue > 0 ? 'font-semibold text-danger-700' : ''} />],
            ['Facturé net', <Money key="i" value={fin?.invoiced_net ?? 0} />],
          ]} />
          <p className="mt-3 text-xs text-muted">Clôture financière : {label(financialStatusLabels, d.financial_status)}{d.financial_closed_at ? ` le ${formatDateFr(d.financial_closed_at)}` : ''}{d.financial_close_note ? ` — ${d.financial_close_note}` : ''}</p>
        </Section>

        {canMargins ? (
          <Section title="Coûts et marges" description={fin?.margin_state === 'provisional' ? 'Provisoire : coûts incomplets ou coûts réels non rapprochés' : 'Définitive'}>
            {fin?.costs_incomplete ? <Alert tone="warning" className="mb-3">Provisoire, coûts incomplets : au moins une prestation active n’a pas de coût.</Alert> : null}
            <DefinitionList className="sm:grid-cols-2" items={[
              ['Coût prévu', <Money key="cp" value={fin?.cost_planned} />],
              ['Coût confirmé', <Money key="cc" value={fin?.cost_confirmed} />],
              ['Coût réel (achats ventilés)', <Money key="ca" value={fin?.cost_actual} />],
              ['Marge prévisionnelle', <Money key="mf" value={fin?.margin_forecast} />],
              ['Marge confirmée', <Money key="mc" value={fin?.margin_confirmed} />],
              ['Marge réelle', <span key="ma"><Money value={fin?.margin_actual} />{fin?.margin_state === 'provisional' ? <Badge tone="warning" className="ml-1">provisoire</Badge> : null}</span>],
            ]} />
          </Section>
        ) : null}

        <Section title="Informations" className={canMargins ? '' : 'xl:col-span-2'}>
          <DefinitionList className="sm:grid-cols-2" items={[
            ['Client payeur', client ? <Link key="cl" className="text-brand-600 hover:underline" href={`/crm/clients/${client.id}`}>{client.display_name}</Link> : null],
            ['Contact', [client?.email, client?.phone].filter(Boolean).join(' · ')],
            ['Responsable', d.owner_id ? names.get(d.owner_id) : <Badge key="o" tone="warning">À attribuer</Badge>],
            ['Destination', d.destination],
            ['Voyage', `${formatDateFr(d.start_date)} → ${formatDateFr(d.end_date)}`],
            ['Voyageurs prévus', `${d.adults} ad. · ${d.children} enf. · ${d.infants} bébé(s)`],
            ['Devis accepté', quote.data ? <Link key="q" className="text-brand-600 hover:underline" href={`/devis/${quote.data.id}${d.accepted_version_id ? `?v=${d.accepted_version_id}` : ''}`}>{quote.data.reference}</Link> : null],
            ['Départ groupe', departure.data ? <Link key="dp" className="text-brand-600 hover:underline" href={`/departs/${departure.data.id}`}>{departure.data.code}</Link> : null],
            ['Notes', d.notes],
          ]} />
          {canUpdate ? (
            <Disclosure summary="Modifier les informations" className="mt-4">
              <OpsForm action={updateDossierInfo}>
                <input type="hidden" name="id" value={id} />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Intitulé" htmlFor="title" required className="md:col-span-2"><Input id="title" name="title" defaultValue={d.title} /></Field>
                  <Field label="Destination" htmlFor="destination"><Input id="destination" name="destination" defaultValue={d.destination ?? ''} /></Field>
                  <Field label="Responsable" htmlFor="owner_id"><StaffSelect staff={staff} name="owner_id" defaultValue={d.owner_id} /></Field>
                  <Field label="Départ" htmlFor="start_date" hint="Un changement de date est historisé ; les dates fournisseurs restent à revérifier"><Input id="start_date" name="start_date" type="date" defaultValue={d.start_date ?? ''} /></Field>
                  <Field label="Retour" htmlFor="end_date"><Input id="end_date" name="end_date" type="date" defaultValue={d.end_date ?? ''} /></Field>
                  <div className="grid grid-cols-3 gap-2 md:col-span-2">
                    <Field label="Adultes" htmlFor="adults"><Input id="adults" name="adults" type="number" min={0} defaultValue={d.adults} /></Field>
                    <Field label="Enfants" htmlFor="children"><Input id="children" name="children" type="number" min={0} defaultValue={d.children} /></Field>
                    <Field label="Bébés" htmlFor="infants"><Input id="infants" name="infants" type="number" min={0} defaultValue={d.infants} /></Field>
                  </div>
                  <Field label="Notes" htmlFor="notes" className="md:col-span-2"><Textarea id="notes" name="notes" defaultValue={d.notes ?? ''} className="min-h-14!" /></Field>
                </div>
                <OpsSubmit>Enregistrer</OpsSubmit>
              </OpsForm>
            </Disclosure>
          ) : null}
        </Section>
      </div>

      <Section title="Échanges consignés">
        <InteractionsList rows={interactions ?? []} names={names} target={{ dossier_id: id, client_id: client?.id }} canAdd={canUpdate} />
      </Section>
    </div>
  )
}
