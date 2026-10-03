import Link from 'next/link'
import { notFound } from 'next/navigation'
import { dossierStatusLabels, formatDateFr, label, leadSourceLabels, leadStageLabels, quoteStatusLabels } from '@hi/core'
import { createAdminClient } from '@hi/db/admin'
import { Alert, Badge, DefinitionList, EmptyState, Field, Input, Select, StatusBadge, Table, Td, Textarea, Th, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { AuditList } from '@/components/ops/audit-list'
import { ClientAccessCard, type ClientAccessAccount } from '@/components/ops/client-access-card'
import { InteractionsList } from '@/components/ops/interactions'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { TravellerFields } from '@/components/ops/traveller-fields'
import { Disclosure, Section } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { addContact, addIdentityDocument, addTraveller, deleteContact, mergeClientsAction, updateClientAction } from '@/lib/ops/actions/crm'
import { db, getStaff } from '@/lib/ops/data'
import { clientKindLabels, languageLabels, paxTypeLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Fiche client' }

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('crm')
  const { id } = await params
  const supabase = await db()
  const { data: c } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  if (!c) notFound()
  const canIdentity = session.can('identity')
  const [staff, contacts, travellers, leads, quotes, dossiers, interactions, dupResult, others] = await Promise.all([
    getStaff(),
    supabase.from('client_contacts').select('*').eq('client_id', id).order('created_at'),
    supabase.from('travellers').select('*').eq('client_id', id).order('last_name'),
    supabase.from('leads').select('id, reference, stage, activity, created_at').eq('client_id', id).order('created_at', { ascending: false }),
    session.can('quotes') ? supabase.from('quotes').select('id, reference, title, status, created_at').eq('client_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    session.can('dossiers') ? supabase.from('dossiers').select('id, reference, title, status, start_date').eq('client_id', id).order('start_date', { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from('interactions').select('*').eq('client_id', id).order('occurred_at', { ascending: false }).limit(50),
    supabase.rpc('find_client_duplicates', { p_email: c.email ?? '', p_phone: c.phone ?? '', p_name: c.display_name ?? undefined }),
    session.can('crm', 'validate') ? supabase.from('clients').select('id, display_name').is('merged_into_id', null).neq('id', id).order('display_name').limit(1000) : Promise.resolve({ data: [] }),
  ])
  const travellerIds = (travellers.data ?? []).map((t) => t.id)
  const [identity, history] = await Promise.all([
    canIdentity && travellerIds.length ? supabase.from('traveller_identity_documents').select('*').in('traveller_id', travellerIds) : Promise.resolve({ data: [] as Array<{ id: string; traveller_id: string; doc_type: string; passport_number: string; issuing_country: string | null; expiry_date: string | null }> }),
    session.can('reports') ? supabase.from('audit_log').select('*').in('record_id', [id, ...travellerIds]).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: null }),
  ])
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const consents = (c.consents ?? {}) as Record<string, unknown>
  const dups = (dupResult.data ?? []).filter((d) => d.id !== id && d.match_reason)
  const canUpdate = session.can('crm', 'update')
  const accounts = await clientAccessAccounts(supabase, id, canUpdate)
  const portalUrl = `${(process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')}/espace-client/connexion`

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.display_name}<Badge tone="brand">{label(clientKindLabels, c.kind)}</Badge></span>}
        description={`Client depuis le ${formatDateFr(c.created_at)} — source : ${label(leadSourceLabels, c.source)}`}
        breadcrumbs={[{ href: '/crm/clients', label: 'Clients' }]}
        actions={
          <>
            {session.can('crm', 'create') ? <Link href={`/crm/demandes/nouvelle?client=${c.id}`} className={buttonClass('secondary', 'sm')}>Nouvelle demande</Link> : null}
            {session.can('quotes', 'create') ? <Link href={`/devis/nouveau?client=${c.id}`} className={buttonClass('accent', 'sm')}>Nouveau devis</Link> : null}
          </>
        }
      />
      <div className="space-y-6">
        {c.merged_into_id ? (
          <Alert tone="warning" title="Fiche fusionnée">Cette fiche a été fusionnée. <Link className="font-semibold underline" href={`/crm/clients/${c.merged_into_id}`}>Ouvrir la fiche conservée</Link></Alert>
        ) : null}
        {dups.length && !c.merged_into_id ? (
          <Alert tone="warning" title="Doublons possibles">
            {dups.map((d) => <span key={d.id} className="mr-3"><Link className="font-semibold underline" href={`/crm/clients/${d.id}`}>{d.display_name}</Link> ({d.match_reason})</span>)}
            {session.can('crm', 'validate') ? <p className="mt-1 text-xs">Une fusion motivée est possible plus bas (section Fusion).</p> : null}
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Identité et coordonnées" className="lg:col-span-2">
            <DefinitionList items={[
              ['E-mail', c.email], ['Téléphone', c.phone], ['Adresse', [c.address, c.city, c.country].filter(Boolean).join(', ')],
              ['Langue', label(languageLabels, c.language)], ['Matricule fiscal', c.tax_id], ['Responsable', c.owner_id ? names.get(c.owner_id) : null],
              ['Conditions commerciales', c.commercial_terms], ['Notes', c.notes],
            ]} />
            {canUpdate && !c.merged_into_id ? (
              <Disclosure summary="Modifier la fiche" className="mt-4">
                <OpsForm action={updateClientAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="kind" value={c.kind} />
                  <div className="grid gap-4 md:grid-cols-2">
                    {c.kind === 'person' ? (
                      <>
                        <Field label="Prénom" htmlFor="first_name"><Input id="first_name" name="first_name" defaultValue={c.first_name ?? ''} /></Field>
                        <Field label="Nom" htmlFor="last_name" required><Input id="last_name" name="last_name" defaultValue={c.last_name ?? ''} /></Field>
                      </>
                    ) : (
                      <>
                        <Field label="Raison sociale" htmlFor="company_name" required><Input id="company_name" name="company_name" defaultValue={c.company_name ?? ''} /></Field>
                        <Field label="Matricule fiscal" htmlFor="tax_id"><Input id="tax_id" name="tax_id" defaultValue={c.tax_id ?? ''} /></Field>
                      </>
                    )}
                    <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={c.email ?? ''} /></Field>
                    <Field label="Téléphone" htmlFor="phone"><Input id="phone" name="phone" defaultValue={c.phone ?? ''} /></Field>
                    <Field label="Adresse" htmlFor="address"><Input id="address" name="address" defaultValue={c.address ?? ''} /></Field>
                    <Field label="Ville" htmlFor="city"><Input id="city" name="city" defaultValue={c.city ?? ''} /></Field>
                    <Field label="Pays" htmlFor="country"><Input id="country" name="country" defaultValue={c.country ?? 'TN'} /></Field>
                    <Field label="Langue" htmlFor="language">
                      <Select id="language" name="language" defaultValue={c.language}>{Object.entries(languageLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                    </Field>
                    <Field label="Source" htmlFor="source">
                      <Select id="source" name="source" defaultValue={c.source}>{Object.entries(leadSourceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                    </Field>
                    <Field label="Conditions commerciales" htmlFor="commercial_terms" className="md:col-span-2"><Textarea id="commercial_terms" name="commercial_terms" defaultValue={c.commercial_terms ?? ''} className="min-h-14!" /></Field>
                    <Field label="Notes" htmlFor="notes" className="md:col-span-2"><Textarea id="notes" name="notes" defaultValue={c.notes ?? ''} className="min-h-14!" /></Field>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent_processing" defaultChecked={consents.processing === true} className="size-4" /> Accord de traitement</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent_marketing" defaultChecked={consents.marketing === true} className="size-4" /> Accepte la prospection</label>
                  </div>
                  <OpsSubmit>Enregistrer</OpsSubmit>
                </OpsForm>
              </Disclosure>
            ) : null}
          </Section>
          <Section title="Consentements">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">Traitement des données <Badge tone={consents.processing ? 'success' : 'danger'}>{consents.processing ? 'Oui' : 'Non'}</Badge></li>
              <li className="flex justify-between">Prospection commerciale <Badge tone={consents.marketing ? 'success' : 'neutral'}>{consents.marketing ? 'Oui' : 'Non'}</Badge></li>
              {consents.collected_at ? <li className="text-xs text-muted">Recueillis le {formatDateFr(String(consents.collected_at))}{consents.channel ? ` (${String(consents.channel)})` : ''}</li> : null}
            </ul>
          </Section>
        </div>

        <Section title="Accès à l’espace client" description="Identifiant de connexion du client au site (suivi de ses dossiers, documents et paiements).">
          <ClientAccessCard clientId={c.id} clientEmail={c.email} accounts={accounts} canManage={canUpdate && !c.merged_into_id} portalUrl={portalUrl} />
        </Section>

        {c.kind === 'company' || (contacts.data?.length ?? 0) > 0 ? (
          <Section title="Contacts">
            {contacts.data?.length ? (
              <ul className="divide-y divide-line">
                {contacts.data.map((ct) => (
                  <li key={ct.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{ct.full_name} {ct.is_decision_maker ? <Badge tone="accent">Décideur</Badge> : null}</p>
                      <p className="text-xs text-muted">{[ct.role, ct.email, ct.phone].filter(Boolean).join(' · ')}</p>
                    </div>
                    {canUpdate ? (
                      <OpsForm action={deleteContact} inline>
                        <input type="hidden" name="id" value={ct.id} />
                        <OpsSubmit size="sm" variant="ghost" confirm="Retirer ce contact ?">Retirer</OpsSubmit>
                      </OpsForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Aucun contact" />}
            {canUpdate ? (
              <Disclosure summary="Ajouter un contact" className="mt-3">
                <OpsForm action={addContact} resetOnSuccess>
                  <input type="hidden" name="client_id" value={c.id} />
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Nom" htmlFor="ct_name" required><Input id="ct_name" name="full_name" /></Field>
                    <Field label="Fonction" htmlFor="ct_role"><Input id="ct_role" name="role" /></Field>
                    <Field label="E-mail" htmlFor="ct_email"><Input id="ct_email" name="email" type="email" /></Field>
                    <Field label="Téléphone" htmlFor="ct_phone"><Input id="ct_phone" name="phone" /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_decision_maker" className="size-4" /> Décideur</label>
                  <OpsSubmit variant="secondary">Ajouter</OpsSubmit>
                </OpsForm>
              </Disclosure>
            ) : null}
          </Section>
        ) : null}

        <Section title="Voyageurs" description="Les voyageurs sont distincts du client payeur.">
          {travellers.data?.length ? (
            <Table className="-mx-5">
              <thead><tr><Th>Voyageur</Th><Th>Type</Th><Th>Naissance</Th><Th>Nationalité</Th>{canIdentity ? <Th>Pièce d’identité</Th> : null}</tr></thead>
              <tbody>
                {travellers.data.map((t) => {
                  const docs = (identity.data ?? []).filter((d) => d.traveller_id === t.id)
                  return (
                    <tr key={t.id}>
                      <Td className="font-medium">{t.first_name} {t.last_name}</Td>
                      <Td>{label(paxTypeLabels, t.pax_type)}</Td>
                      <Td>{formatDateFr(t.birth_date)}</Td>
                      <Td>{t.nationality ?? '—'}</Td>
                      {canIdentity ? (
                        <Td>
                          {docs.map((d) => (
                            <p key={d.id} className="text-xs">{d.doc_type === 'passport' ? 'Passeport' : 'Pièce'} {d.passport_number} ({d.issuing_country ?? '—'}) — exp. {formatDateFr(d.expiry_date)}
                              {d.expiry_date && d.expiry_date < new Date().toISOString().slice(0, 10) ? <Badge tone="danger" className="ml-1">Expiré</Badge> : null}</p>
                          ))}
                          {session.can('identity', 'update') ? (
                            <details className="mt-1 text-xs">
                              <summary className="cursor-pointer text-brand-600">Ajouter une pièce</summary>
                              <OpsForm action={addIdentityDocument} resetOnSuccess className="mt-2">
                                <input type="hidden" name="traveller_id" value={t.id} />
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <Select name="doc_type" defaultValue="passport" aria-label="Type"><option value="passport">Passeport</option><option value="national_id">Carte d’identité</option><option value="other">Autre</option></Select>
                                  <Input name="passport_number" placeholder="Numéro" aria-label="Numéro" />
                                  <Input name="issuing_country" placeholder="Pays d’émission" aria-label="Pays d’émission" />
                                  <Input name="expiry_date" type="date" aria-label="Expiration" title="Date d’expiration" />
                                </div>
                                <OpsSubmit size="sm" variant="secondary">Enregistrer</OpsSubmit>
                              </OpsForm>
                            </details>
                          ) : null}
                        </Td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          ) : <EmptyState title="Aucun voyageur enregistré" />}
          {session.can('crm', 'create') ? (
            <Disclosure summary="Ajouter un voyageur" className="mt-3">
              <OpsForm action={addTraveller} resetOnSuccess>
                <input type="hidden" name="client_id" value={c.id} />
                <TravellerFields />
                <OpsSubmit variant="secondary">Ajouter le voyageur</OpsSubmit>
              </OpsForm>
            </Disclosure>
          ) : null}
        </Section>

        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Demandes">
            {leads.data?.length ? leads.data.map((l) => (
              <p key={l.id} className="flex justify-between py-1 text-sm"><Link className="text-brand-600 hover:underline" href={`/crm/demandes/${l.id}`}>{l.reference}</Link><StatusBadge status={l.stage === 'received' ? 'received_lead' : l.stage} labels={{ ...leadStageLabels, received_lead: 'Demande reçue' }} /></p>
            )) : <p className="text-sm text-muted">Aucune demande</p>}
          </Section>
          <Section title="Devis">
            {quotes.data?.length ? quotes.data.map((q) => (
              <p key={q.id} className="flex justify-between gap-2 py-1 text-sm"><Link className="truncate text-brand-600 hover:underline" href={`/devis/${q.id}`}>{q.reference}</Link><StatusBadge status={q.status} labels={quoteStatusLabels} /></p>
            )) : <p className="text-sm text-muted">Aucun devis</p>}
          </Section>
          <Section title="Dossiers">
            {dossiers.data?.length ? dossiers.data.map((d) => (
              <p key={d.id} className="flex justify-between gap-2 py-1 text-sm"><Link className="truncate text-brand-600 hover:underline" href={`/dossiers/${d.id}`}>{d.reference} · {formatDateFr(d.start_date)}</Link><StatusBadge status={d.status} labels={dossierStatusLabels} /></p>
            )) : <p className="text-sm text-muted">Aucun dossier</p>}
          </Section>
        </div>

        <Section title="Échanges consignés">
          <InteractionsList rows={interactions.data ?? []} names={names} target={{ client_id: c.id }} canAdd={session.can('crm', 'create')} />
        </Section>

        {session.can('crm', 'validate') && !c.merged_into_id ? (
          <Section title="Fusion de fiches" description="Absorber une fiche en double dans celle-ci : demandes, voyageurs, échanges et contacts sont rattachés ici ; la fiche absorbée est archivée. Motif obligatoire.">
            <OpsForm action={mergeClientsAction}>
              <input type="hidden" name="keep" value={c.id} />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Fiche à absorber" htmlFor="merge" required>
                  <Select id="merge" name="merge" required defaultValue="">
                    <option value="" disabled>Choisir…</option>
                    {dups.length ? <optgroup label="Doublons possibles">{dups.map((d) => <option key={d.id} value={d.id}>{d.display_name} ({d.match_reason})</option>)}</optgroup> : null}
                    <optgroup label="Toutes les fiches">{(others.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}</optgroup>
                  </Select>
                </Field>
                <Field label="Motif" htmlFor="reason" required><Input id="reason" name="reason" placeholder="Ex. même personne, e-mail et téléphone identiques" /></Field>
              </div>
              <OpsSubmit variant="danger" confirm="Confirmer la fusion ? La fiche absorbée sera archivée (historique conservé).">Fusionner dans cette fiche</OpsSubmit>
            </OpsForm>
          </Section>
        ) : null}

        {history.data ? (
          <Section title="Historique des modifications">
            <AuditList rows={history.data} names={names} />
          </Section>
        ) : null}
      </div>
    </>
  )
}

/**
 * Comptes de l’espace client rattachés à la fiche (RLS). L’identifiant de connexion est lu dans
 * auth.users avec la clé service, uniquement pour les détenteurs de crm.update (contrôlé ci-dessus).
 */
async function clientAccessAccounts(supabase: Awaited<ReturnType<typeof db>>, clientId: string, canUpdate: boolean): Promise<ClientAccessAccount[]> {
  const { data } = await supabase.from('client_accounts').select('user_id, created_at').eq('client_id', clientId).order('created_at')
  const rows = data ?? []
  if (!canUpdate || rows.length === 0) return rows.map((r) => ({ userId: r.user_id, email: null, createdAt: r.created_at }))
  await requireStaff('crm', 'update')
  const admin = createAdminClient()
  return Promise.all(rows.map(async (r) => {
    const { data: u } = await admin.auth.admin.getUserById(r.user_id)
    return { userId: r.user_id, email: u.user?.email ?? null, createdAt: r.created_at, lastSignInAt: u.user?.last_sign_in_at ?? null }
  }))
}
