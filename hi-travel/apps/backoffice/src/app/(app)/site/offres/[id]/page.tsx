import { notFound } from 'next/navigation'
import { formatDateTimeFr, formatMoney, publicationStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, CardBody, CardHeader, DateText, Field, Input, Select, StatusBadge, Table, Td, Th, Textarea, buttonClass } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { MoneyTd } from '@/components/fin/common'
import { OfferEditor, type OfferData } from '@/components/admin/offer-editor'
import { Notice } from '@/components/fin/notice'
import { requireStaff } from '@/lib/auth'
import { n, sp, type SearchParams } from '@/lib/fin/format'
import { saveCosting, saveDeparture, saveOffer, setOfferStatus } from '../../actions'

export const metadata = { title: 'Offre' }

const DEP_STATUS: Record<string, string> = { open: 'Ouvert', closed: 'Fermé', cancelled: 'Annulé' }

function toLocal(ts: string | null) {
  if (!ts) return ''
  // Affichage à l'heure de Tunis (UTC+1)
  return new Date(new Date(ts).getTime() + 3600_000).toISOString().slice(0, 16)
}

function DepartureFields({ d }: { d?: { code: string; start_date: string; end_date: string; capacity: number; price_adult: number | null; price_child: number | null; price_infant: number | null; single_supplement: number | null; deposit_amount: number | null; booking_deadline: string | null; option_hold_hours: number; min_participants: number | null; status: string } }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Field label="Code" htmlFor="code"><Input name="code" defaultValue={d?.code ?? ''} required /></Field>
      <Field label="Début"><Input name="start_date" type="date" defaultValue={d?.start_date ?? ''} required /></Field>
      <Field label="Fin"><Input name="end_date" type="date" defaultValue={d?.end_date ?? ''} required /></Field>
      <Field label="Capacité"><Input name="capacity" type="number" min={0} defaultValue={d?.capacity ?? ''} required /></Field>
      <Field label="Minimum"><Input name="min_participants" type="number" min={0} defaultValue={d?.min_participants ?? ''} /></Field>
      <Field label="Statut"><Select name="status" defaultValue={d?.status ?? 'open'}>{Object.entries(DEP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Prix adulte"><Input name="price_adult" inputMode="decimal" defaultValue={d?.price_adult ?? ''} /></Field>
      <Field label="Prix enfant"><Input name="price_child" inputMode="decimal" defaultValue={d?.price_child ?? ''} /></Field>
      <Field label="Prix bébé"><Input name="price_infant" inputMode="decimal" defaultValue={d?.price_infant ?? ''} /></Field>
      <Field label="Suppl. single"><Input name="single_supplement" inputMode="decimal" defaultValue={d?.single_supplement ?? ''} /></Field>
      <Field label="Acompte"><Input name="deposit_amount" inputMode="decimal" defaultValue={d?.deposit_amount ?? ''} /></Field>
      <Field label="Date limite résa"><Input name="booking_deadline" type="date" defaultValue={d?.booking_deadline ?? ''} /></Field>
      <Field label="Option (heures)"><Input name="option_hold_hours" type="number" min={1} defaultValue={d?.option_hold_hours ?? 72} /></Field>
    </div>
  )
}

export default async function OfferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const session = await requireStaff('site', 'read')
  const sparams = await searchParams
  const { id } = await params
  const supabase = await createClient()
  const { data: o } = await supabase.from('offers').select('*').eq('id', id).maybeSingle()
  if (!o) notFound()
  const margins = session.can('margins', 'read')
  const [{ data: departures }, costing] = await Promise.all([
    supabase.from('departures').select('*').eq('offer_id', id).order('start_date'),
    margins ? supabase.from('offer_costings').select('*').eq('offer_id', id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ])
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const canEdit = session.can('site', 'update')
  const canPublish = session.can('site', 'validate')
  const canDepartures = session.can('departures', 'update')
  const now = new Date().toISOString()
  const live = o.status === 'published' && (!o.publish_at || o.publish_at <= now) && (!o.unpublish_at || o.unpublish_at > now)

  const statusButton = (status: string, label: string, variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary', confirm?: string) => (
    <ActionForm action={setOfferStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={variant} confirm={confirm}>{label}</SubmitButton>
    </ActionForm>
  )

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{o.title} <StatusBadge status={o.status} labels={publicationStatusLabels} /></span>}
        description={live ? 'En ligne sur le site public.' : o.status === 'published' ? 'Publiée mais hors fenêtre de publication (programmation).' : 'Non visible sur le site public.'}
        breadcrumbs={[{ href: '/site/offres', label: 'Offres' }]}
        actions={<a className={buttonClass('secondary')} href={`${siteUrl}/offres/${o.slug}`} target="_blank" rel="noreferrer">Prévisualiser sur le site ↗</a>}
      />
      <Notice code={sp(sparams.notice)} refValue={sp(sparams.ref)} />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Contenu de l’offre" description="Modèle de voyage ; les départs datés sont gérés à part." />
            <CardBody>
              {canEdit ? (
                <OfferEditor action={saveOffer} offer={{ ...o, internal_notes: undefined } as unknown as OfferData} slugLocked={!!o.published_by} />
              ) : <p className="text-sm text-muted">Lecture seule.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Départs datés" description="Capacité, prix adulte / enfant / bébé, supplément single, acompte, date limite et durée d’option. Les départs complets ou expirés ne sont pas proposés comme réservables." />
            {(departures ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucun départ daté.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Code</Th><Th>Dates</Th><Th>Statut</Th><Th className="text-right">Places</Th><Th className="text-right">Adulte</Th><Th className="text-right">Enfant</Th><Th className="text-right">Single</Th><Th className="text-right">Acompte</Th><Th>Limite</Th>{canDepartures ? <Th /> : null}</tr></thead>
                <tbody>
                  {(departures ?? []).map((d) => (
                    <tr key={d.id}>
                      <Td className="font-mono text-xs">{d.code}</Td>
                      <Td className="whitespace-nowrap text-xs"><DateText value={d.start_date} /> → <DateText value={d.end_date} /></Td>
                      <Td><Badge tone={d.status === 'open' ? 'success' : d.status === 'closed' ? 'neutral' : 'danger'}>{DEP_STATUS[d.status]}</Badge></Td>
                      <Td className="text-right text-xs">{d.seats_confirmed} conf. + {d.seats_on_option} opt. / {d.capacity}<span className="block text-muted">{Math.max(d.capacity - d.seats_confirmed - d.seats_on_option, 0)} dispo.</span></Td>
                      <MoneyTd value={d.price_adult} /><MoneyTd value={d.price_child} /><MoneyTd value={d.single_supplement} /><MoneyTd value={d.deposit_amount} />
                      <Td><DateText value={d.booking_deadline} /></Td>
                      {canDepartures ? (
                        <Td>
                          <details>
                            <summary className="cursor-pointer text-xs text-brand-600">Modifier</summary>
                            <div className="mt-2 w-[min(80vw,900px)]">
                              <ActionForm action={saveDeparture}>
                                <input type="hidden" name="id" value={d.id} />
                                <input type="hidden" name="offer_id" value={id} />
                                <DepartureFields d={{ ...d, price_adult: d.price_adult, price_child: d.price_child, price_infant: d.price_infant, single_supplement: d.single_supplement, deposit_amount: d.deposit_amount }} />
                                <SubmitButton size="sm">Enregistrer le départ</SubmitButton>
                              </ActionForm>
                            </div>
                          </details>
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {canDepartures ? (
              <CardBody className="border-t border-line">
                <p className="mb-2 text-sm font-medium text-brand-900">Nouveau départ</p>
                <ActionForm action={saveDeparture} resetOnSuccess>
                  <input type="hidden" name="offer_id" value={id} />
                  <DepartureFields />
                  <SubmitButton size="sm">Créer le départ</SubmitButton>
                </ActionForm>
              </CardBody>
            ) : <CardBody className="border-t border-line text-xs text-muted">Création et modification des départs : profils habilités « départs et groupes ».</CardBody>}
          </Card>

          {margins ? (
            <Card>
              <CardHeader title="Chiffrage interne" description="Confidentiel : jamais exposé au site public ni au profil « gestion du site »." />
              <CardBody>
                <ActionForm action={saveCosting}>
                  <input type="hidden" name="offer_id" value={id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Coût estimé par personne (TND)"><Input name="estimated_cost" inputMode="decimal" defaultValue={costing?.estimated_cost ?? ''} /></Field>
                    <Field label="Marge cible (%)"><Input name="target_margin_pct" inputMode="decimal" defaultValue={costing?.target_margin_pct ?? ''} /></Field>
                    <div className="text-sm">
                      <p className="text-xs uppercase text-muted">Marge indicative</p>
                      <p className="mt-2 tabular">{o.price_amount != null && costing?.estimated_cost != null ? `${formatMoney(n(o.price_amount) - n(costing.estimated_cost))} (${Math.round(((n(o.price_amount) - n(costing.estimated_cost)) / n(o.price_amount)) * 1000) / 10} %)` : '—'}</p>
                    </div>
                  </div>
                  <Field label="Notes internes"><Textarea name="notes" rows={2} defaultValue={costing?.notes ?? ''} /></Field>
                  <SubmitButton size="sm" variant="secondary">Enregistrer</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Publication" description="Brouillon → À valider → Publié / Masqué / Archivé" />
            <CardBody className="space-y-3 text-sm">
              <p>Statut : <StatusBadge status={o.status} labels={publicationStatusLabels} /></p>
              {o.publish_at ? <p className="text-xs">Publication programmée : {formatDateTimeFr(o.publish_at)}</p> : null}
              {o.unpublish_at ? <p className="text-xs">Retrait programmé : {formatDateTimeFr(o.unpublish_at)}</p> : null}
              {o.price_amount == null ? <Alert tone="warning">Prix affiché requis avant publication.</Alert> : null}
              <div className="flex flex-wrap gap-2">
                {canEdit && (o.status === 'draft' || o.status === 'hidden') ? statusButton('review', 'Soumettre à validation', 'primary') : null}
                {canEdit && o.status === 'review' ? statusButton('draft', 'Renvoyer en brouillon', 'ghost') : null}
                {canEdit && o.status === 'published' ? statusButton('hidden', 'Masquer', 'secondary', 'Masquer cette offre du site public ?') : null}
                {canEdit && o.status === 'archived' ? statusButton('draft', 'Restaurer en brouillon', 'ghost') : null}
                {session.can('site', 'archive') && o.status !== 'archived' ? statusButton('archived', 'Archiver', 'ghost', 'Archiver cette offre ? Elle sera retirée du site.') : null}
              </div>
              {canPublish && o.status !== 'archived' ? (
                <ActionForm action={setOfferStatus}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="status" value="published" />
                  <Field label="Publier à partir du (optionnel)"><Input name="publish_at" type="datetime-local" defaultValue={toLocal(o.publish_at)} /></Field>
                  <Field label="Retirer le (optionnel)"><Input name="unpublish_at" type="datetime-local" defaultValue={toLocal(o.unpublish_at)} /></Field>
                  <SubmitButton size="sm" confirm="Publier cette offre sur le site public ? Vérifiez prix, base du prix, acompte et conditions.">
                    {o.status === 'published' ? 'Mettre à jour la programmation' : 'Publier'}
                  </SubmitButton>
                </ActionForm>
              ) : !canPublish ? <p className="text-xs text-muted">La publication est réservée à un utilisateur habilité (site : valider).</p> : null}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-1 text-xs text-muted">
              <p>Adresse publique : <span className="font-mono text-ink">/offres/{o.slug}</span></p>
              <p>Dernière modification : {formatDateTimeFr(o.updated_at)}</p>
              <p>Le site public n’expose que les colonnes sûres (vue site_offers) : aucun coût, marge ni note interne.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
