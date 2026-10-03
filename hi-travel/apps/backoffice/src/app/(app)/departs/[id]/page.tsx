import Link from 'next/link'
import { notFound } from 'next/navigation'
import { dossierStatusLabels, formatDateFr, formatDateTimeFr, label } from '@hi/core'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Money, Select, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { TimeLeft } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { nowMs } from '@/lib/ops/format'
import { confirmHold, expireOptionsNow, placeHold, releaseHold } from '@/lib/ops/actions/departures'
import { db, getOpenDossierOptions } from '@/lib/ops/data'
import { holdKindLabels, holdStatusLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Départ' }

export default async function DeparturePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('departures')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await db()
  const { data: dep } = await supabase.from('departures').select('*, offers(id, title, destination, is_omra, activity)').eq('id', id).maybeSingle()
  if (!dep) notFound()
  const [{ data: holds }, { data: attached }, dossierOptions, { data: leads }] = await Promise.all([
    supabase.from('departure_holds').select('*, dossiers(id, reference, title), leads(id, reference)').eq('departure_id', id).order('created_at', { ascending: false }),
    session.can('dossiers') ? supabase.from('dossiers').select('id, reference, title, status, adults, children, infants, clients(display_name)').eq('departure_id', id).order('reference') : Promise.resolve({ data: [] }),
    session.can('dossiers') ? getOpenDossierOptions() : Promise.resolve([]),
    session.can('crm') ? supabase.from('leads').select('id, reference, destination').not('stage', 'in', '(won,lost)').order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
  ])
  const offer = dep.offers as { id: string; title: string; destination: string; is_omra: boolean } | null
  const avail = dep.capacity - dep.seats_confirmed - dep.seats_on_option
  const active = (holds ?? []).filter((h) => h.status === 'active')
  const history = (holds ?? []).filter((h) => h.status !== 'active')
  const now = nowMs()
  const expired = active.filter((h) => h.kind === 'option' && h.expires_at && Date.parse(h.expires_at) < now)
  const canUpdate = session.can('departures', 'update')
  const pct = (n: number) => `${dep.capacity ? Math.round((n / dep.capacity) * 100) : 0}%`
  const defaultExpiry = new Date(now + dep.option_hold_hours * 3600_000)

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{dep.code}{offer?.is_omra ? <Badge tone="accent">Omra</Badge> : null}</span>}
        description={<>{offer?.title} — {formatDateFr(dep.start_date)} → {formatDateFr(dep.end_date)}{session.can('site') && offer ? <> — <Link className="text-brand-600 hover:underline" href={`/site/offres/${offer.id}`}>fiche offre</Link></> : null}</>}
        breadcrumbs={[{ href: '/departs', label: 'Départs et groupes' }]}
        actions={session.can('quotes', 'create') ? <Link href={`/devis/nouveau?depart=${dep.id}`} className={buttonClass('accent', 'sm')}>Devis sur ce départ</Link> : null}
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Capacité" value={dep.capacity} />
          <Tile label="Confirmées" value={dep.seats_confirmed} hint={dep.min_participants ? `minimum de départ : ${dep.min_participants}` : undefined} />
          <Tile label="En option" value={dep.seats_on_option} hint={expired.length ? `${expired.length} option(s) échue(s)` : undefined} warn={expired.length > 0} />
          <Tile label="Disponibles" value={avail} warn={avail <= 0} />
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-canvas ring-1 ring-line" aria-label="Remplissage">
          <div className="flex h-full">
            <div className="bg-brand-500" style={{ width: pct(dep.seats_confirmed) }} title="Confirmées" />
            <div className="bg-accent-400" style={{ width: pct(dep.seats_on_option) }} title="Options" />
          </div>
        </div>
        <p className="text-xs text-muted">Bleu : confirmées · orange : options · prix adulte <Money value={dep.price_adult} currency={dep.currency} /> · enfant <Money value={dep.price_child} currency={dep.currency} /> · supplément single <Money value={dep.single_supplement} currency={dep.currency} /> · limite de réservation {formatDateFr(dep.booking_deadline)} · option fournisseur {formatDateFr(dep.supplier_option_deadline)} · durée d’option {dep.option_hold_hours} h</p>

        {expired.length && canUpdate ? (
          <Alert tone="warning" title={`${expired.length} option(s) dépassée(s)`}>
            <OpsForm action={expireOptionsNow} inline className="mt-2"><OpsSubmit size="sm" variant="secondary" confirm="Expirer les options échues et libérer les places ?">Expirer les options maintenant</OpsSubmit></OpsForm>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
          <Card>
            <CardHeader title={`Réservations actives (${active.length})`} description="Options temporaires et places confirmées par dossier ou demande." />
            <CardBody>
              {active.length ? (
                <Table className="-mx-5">
                  <thead><tr><Th>Rattachement</Th><Th className="text-right">Places</Th><Th>Type</Th><Th>Expiration</Th>{canUpdate ? <Th /> : null}</tr></thead>
                  <tbody>
                    {active.map((h) => {
                      const d = h.dossiers as { id: string; reference: string; title: string } | null
                      const l = h.leads as { id: string; reference: string } | null
                      return (
                        <tr key={h.id}>
                          <Td>{d ? <Link className="text-brand-600 hover:underline" href={`/dossiers/${d.id}`}>{d.reference}</Link> : l ? <Link className="text-brand-600 hover:underline" href={`/crm/demandes/${l.id}`}>{l.reference}</Link> : '—'}<p className="text-xs text-muted">{formatDateTimeFr(h.created_at)}</p></Td>
                          <Td className="text-right font-medium">{h.seats}</Td>
                          <Td><Badge tone={h.kind === 'confirmed' ? 'success' : 'warning'}>{label(holdKindLabels, h.kind)}</Badge></Td>
                          <Td>{h.kind === 'option' ? <>{formatDateTimeFr(h.expires_at)}<br /><TimeLeft dueAt={h.expires_at} /></> : '—'}</Td>
                          {canUpdate ? (
                            <Td className="whitespace-nowrap text-right">
                              <span className="flex justify-end gap-1">
                                {h.kind === 'option' ? <OpsForm action={confirmHold} inline><input type="hidden" name="hold_id" value={h.id} /><OpsSubmit size="sm" variant="secondary" confirm="Convertir cette option en places confirmées ?">Confirmer</OpsSubmit></OpsForm> : null}
                                <OpsForm action={releaseHold} inline><input type="hidden" name="hold_id" value={h.id} /><OpsSubmit size="sm" variant="ghost" confirm="Libérer ces places ?">Libérer</OpsSubmit></OpsForm>
                              </span>
                            </Td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              ) : <EmptyState title="Aucune réservation active" />}
              {history.length ? (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-brand-600">Historique ({history.length})</summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {history.map((h) => <li key={h.id}>{formatDateTimeFr(h.created_at)} — {h.seats} place(s) {label(holdKindLabels, h.kind).toLowerCase()} — {label(holdStatusLabels, h.status)} {h.released_at ? `le ${formatDateTimeFr(h.released_at)}` : ''} — {(h.dossiers as { reference?: string } | null)?.reference ?? (h.leads as { reference?: string } | null)?.reference}</li>)}
                  </ul>
                </details>
              ) : null}
            </CardBody>
          </Card>

          {canUpdate && dep.status === 'open' ? (
            <Card>
              <CardHeader title="Poser une option / confirmer des places" description="Contrôle de capacité atomique : une demande supérieure aux places disponibles est refusée." />
              <CardBody>
                <OpsForm action={placeHold} resetOnSuccess>
                  <input type="hidden" name="departure_id" value={dep.id} />
                  <Field label="Nombre de places" htmlFor="seats" required><Input id="seats" name="seats" type="number" min={1} defaultValue={1} /></Field>
                  <Field label="Type" htmlFor="kind"><Select id="kind" name="kind" defaultValue="option"><option value="option">Option temporaire</option><option value="confirmed">Places confirmées</option></Select></Field>
                  <Field label="Dossier" htmlFor="dossier_id">
                    <Select id="dossier_id" name="dossier_id" defaultValue=""><option value="">—</option>{dossierOptions.map((d) => <option key={d.id} value={d.id}>{d.reference} — {d.title}</option>)}</Select>
                  </Field>
                  <Field label="ou demande" htmlFor="lead_id">
                    <Select id="lead_id" name="lead_id" defaultValue=""><option value="">—</option>{(leads ?? []).map((l) => <option key={l.id} value={l.id}>{l.reference}{l.destination ? ` — ${l.destination}` : ''}</option>)}</Select>
                  </Field>
                  <Field label="Expiration de l’option" htmlFor="expires_at" hint={`Par défaut : ${dep.option_hold_hours} h (règle du départ), soit ${formatDateTimeFr(defaultExpiry.toISOString())}`}>
                    <Input id="expires_at" name="expires_at" type="datetime-local" />
                  </Field>
                  <OpsSubmit>Réserver</OpsSubmit>
                </OpsForm>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader
            title={`Dossiers rattachés (${attached?.length ?? 0})`}
            actions={session.can('departures', 'export') ? (
              <form method="get" action={`/departs/${dep.id}/export`} className="flex flex-wrap items-center gap-2">
                <Select name="liste" defaultValue="rooming" className="h-8! w-auto! text-xs!" aria-label="Liste à exporter">
                  <option value="rooming">Rooming list</option><option value="passagers">Liste passagers</option><option value="transferts">Liste des transferts</option>
                </Select>
                {session.can('identity') ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="passeports" value="1" className="size-4" /> Inclure les passeports (liste passagers)</label> : null}
                <button type="submit" className={buttonClass('secondary', 'sm')}>Exporter (CSV)</button>
              </form>
            ) : null}
          />
          <CardBody>
            {attached?.length ? (
              <ul className="divide-y divide-line">
                {attached.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><Link className="font-medium text-brand-600 hover:underline" href={`/dossiers/${d.id}`}>{d.reference}</Link> — {(d.clients as { display_name?: string } | null)?.display_name} — {d.adults} ad. {d.children ? `+ ${d.children} enf.` : ''}{d.infants ? ` + ${d.infants} bébé(s)` : ''}</span>
                    <StatusBadge status={d.status} labels={dossierStatusLabels} />
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Aucun dossier rattaché" description="Les dossiers créés depuis un devis sur ce départ apparaissent ici." />}
            <p className="mt-3 text-xs text-muted">Les exports ne contiennent que les colonnes utiles au destinataire (hôtel, transporteur) ; les numéros de passeport ne sont inclus que sur demande explicite et avec le droit d’accès aux pièces d’identité.</p>
          </CardBody>
        </Card>
      </div>
    </>
  )
}

function Tile({ label: l, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{l}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tabular ${warn ? 'text-danger-700' : 'text-brand-900'}`}>{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
