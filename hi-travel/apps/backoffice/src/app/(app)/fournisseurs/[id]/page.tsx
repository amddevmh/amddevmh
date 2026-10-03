import Link from 'next/link'
import { notFound } from 'next/navigation'
import { boardLabels, formatDateFr, formatMoney, label } from '@hi/core'
import { Badge, DefinitionList, EmptyState, Field, Input, Select, Table, Td, Textarea, Th, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { SupplierFields } from '@/components/ops/supplier-fields'
import { Disclosure, Section } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { saveContract, saveHotel, saveRate, saveSupplier, saveSupplierContact } from '@/lib/ops/actions/suppliers'
import { db } from '@/lib/ops/data'
import { supplierKindLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Fournisseur' }

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('suppliers')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await db()
  const { data: s } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle()
  if (!s) notFound()
  const isHotel = ['hotel', 'hotel_platform'].includes(s.kind)
  const [{ data: contracts }, { data: hotels }, services] = await Promise.all([
    supabase.from('supplier_contracts').select('*').eq('supplier_id', id).order('valid_from', { ascending: false }),
    supabase.from('hotels').select('*').eq('supplier_id', id).order('name'),
    session.can('dossiers') ? supabase.from('services').select('id, description, status, start_date, dossier_id, dossiers(reference)').eq('supplier_id', id).neq('status', 'cancelled').order('start_date', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
  ])
  const hotelIds = (hotels ?? []).map((h) => h.id)
  const { data: rates } = hotelIds.length ? await supabase.from('hotel_rates').select('*').in('hotel_id', hotelIds).order('valid_from', { ascending: false }) : { data: [] }
  const canUpdate = session.can('suppliers', 'update')
  const contacts = (Array.isArray(s.contacts) ? s.contacts : []) as Array<Record<string, string | null>>
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{s.name}<Badge tone="brand">{label(supplierKindLabels, s.kind)}</Badge>{!s.active ? <Badge>Inactif</Badge> : null}</span>}
        description={[s.city, s.country].filter(Boolean).join(', ') + ` — devise ${s.currency}`}
        breadcrumbs={[{ href: '/fournisseurs', label: 'Fournisseurs' }]}
        actions={
          <>
            {session.can('finance', 'create') ? <Link href={`/finances/fournisseurs/nouvelle?supplier=${s.id}`} className={buttonClass('secondary', 'sm')}>Saisir une pièce fournisseur</Link> : null}
            {session.can('dossiers') ? <Link href={`/modules?fournisseur=${s.id}`} className={buttonClass('ghost', 'sm')}>Prestations de ce fournisseur</Link> : null}
          </>
        }
      />
      <div className="space-y-6">
        <Section title="Fiche fournisseur">
          <DefinitionList items={[
            ['E-mail', s.email], ['Téléphone', s.phone], ['Matricule fiscal', s.tax_id], ['Destinations', s.destinations.join(', ')],
            ['Conditions de paiement', s.payment_terms], ['Retenue à la source', s.withholding_applicable ? 'Applicable' : 'Non applicable'],
            ['Conditions', s.conditions], ['Compte auxiliaire', s.account_code],
          ]} />
          {canUpdate ? (
            <Disclosure summary="Modifier la fiche" className="mt-4">
              <OpsForm action={saveSupplier}>
                <input type="hidden" name="id" value={s.id} />
                <SupplierFields s={s} />
                <OpsSubmit>Enregistrer</OpsSubmit>
              </OpsForm>
            </Disclosure>
          ) : null}
        </Section>

        <Section title="Contacts">
          {contacts.length ? (
            <ul className="divide-y divide-line">
              {contacts.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span><strong>{c.name}</strong>{c.role ? ` — ${c.role}` : ''} <span className="text-xs text-muted">{[c.email, c.phone].filter(Boolean).join(' · ')}</span></span>
                  {canUpdate ? (
                    <OpsForm action={saveSupplierContact} inline>
                      <input type="hidden" name="supplier_id" value={s.id} /><input type="hidden" name="index" value={i} />
                      <OpsSubmit size="sm" variant="ghost" name="remove" value="1" confirm="Retirer ce contact ?">Retirer</OpsSubmit>
                    </OpsForm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Aucun contact" />}
          {canUpdate ? (
            <Disclosure summary="Ajouter un contact" className="mt-3">
              <OpsForm action={saveSupplierContact} resetOnSuccess>
                <input type="hidden" name="supplier_id" value={s.id} />
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Nom" htmlFor="c_name" required><Input id="c_name" name="name" /></Field>
                  <Field label="Fonction" htmlFor="c_role"><Input id="c_role" name="role" placeholder="Réservations, comptabilité…" /></Field>
                  <Field label="E-mail" htmlFor="c_email"><Input id="c_email" name="email" type="email" /></Field>
                  <Field label="Téléphone" htmlFor="c_phone"><Input id="c_phone" name="phone" /></Field>
                </div>
                <OpsSubmit variant="secondary">Ajouter</OpsSubmit>
              </OpsForm>
            </Disclosure>
          ) : null}
        </Section>

        <Section title="Contrats" description="Contrats datés : conditions enfants, gratuités, suppléments et pénalités.">
          {contracts?.length ? (
            <div className="space-y-3">
              {contracts.map((c) => {
                const terms = (c.terms ?? {}) as Record<string, string | null>
                const current = (!c.valid_from || c.valid_from <= today) && (!c.valid_to || c.valid_to >= today)
                return (
                  <div key={c.id} className="rounded-lg border border-line p-3">
                    <p className="flex flex-wrap items-center justify-between gap-2 font-medium">{c.title}<Badge tone={current ? 'success' : 'neutral'}>{current ? 'En vigueur' : 'Hors période'}</Badge></p>
                    <p className="text-xs text-muted">Du {formatDateFr(c.valid_from)} au {formatDateFr(c.valid_to)} — {c.currency}</p>
                    <DefinitionList className="mt-2" items={[['Enfants', c.child_rules], ['Gratuités', c.free_places], ['Pénalités', c.penalties], ['Suppléments', terms.supplements], ['Notes', terms.notes]]} />
                    {canUpdate ? (
                      <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand-600">Modifier</summary><ContractForm supplierId={s.id} contract={{ ...c, supplements: terms.supplements ?? '', notes: terms.notes ?? '' }} currency={s.currency} /></details>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : <EmptyState title="Aucun contrat" />}
          {canUpdate ? <Disclosure summary="Ajouter un contrat" className="mt-3"><ContractForm supplierId={s.id} currency={s.currency} /></Disclosure> : null}
        </Section>

        {isHotel || hotels?.length ? (
          <Section title="Hôtels et tarifs datés" description="Référentiel hôtelier et tarifs par saison, chambre et pension. Tarifs contractuels et ponctuels distingués.">
            {hotels?.length ? hotels.map((h) => {
              const hr = (rates ?? []).filter((r) => r.hotel_id === h.id)
              return (
                <div key={h.id} className="mb-4 rounded-lg border border-line p-3">
                  <p className="font-medium">{h.name} {h.category ? '★'.repeat(h.category) : ''} <span className="text-xs text-muted">— {h.city}, {h.country}</span></p>
                  <p className="text-xs text-muted">Chambres : {h.room_types.join(', ') || '—'} · Pensions : {h.boards.join(', ') || '—'}{h.child_rules ? ` · Enfants : ${h.child_rules}` : ''}</p>
                  {hr.length ? (
                    <Table className="mt-2">
                      <thead><tr><Th>Saison</Th><Th>Période</Th><Th>Chambre</Th><Th>Pension</Th><Th>Nature</Th><Th className="text-right">Nuit</Th><Th className="text-right">Suppl. single</Th><Th className="text-right">Réduc. enfant</Th>{canUpdate ? <Th /> : null}</tr></thead>
                      <tbody>
                        {hr.map((r) => (
                          <tr key={r.id}>
                            <Td>{r.season}</Td><Td className="whitespace-nowrap">{formatDateFr(r.valid_from)} → {formatDateFr(r.valid_to)}</Td><Td>{r.room_type}</Td>
                            <Td>{r.board} <span className="text-xs text-muted">{label(boardLabels, r.board)}</span></Td>
                            <Td><Badge tone={r.rate_kind === 'contract' ? 'brand' : 'accent'}>{r.rate_kind === 'contract' ? 'Contractuel' : 'Ponctuel'}</Badge></Td>
                            <Td className="text-right">{formatMoney(r.price_per_night, r.currency)}</Td><Td className="text-right">{formatMoney(r.single_supplement, r.currency)}</Td><Td className="text-right">{r.child_discount_pct} %</Td>
                            {canUpdate ? (
                              <Td>
                                <OpsForm action={saveRate} inline>
                                  {Object.entries({ id: r.id, hotel_id: h.id, season: r.season, valid_from: r.valid_from, valid_to: r.valid_to, room_type: r.room_type, board: r.board, rate_kind: r.rate_kind, price_per_night: String(r.price_per_night), currency: r.currency }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                                  <OpsSubmit size="sm" variant="ghost" name="remove" value="1" confirm="Supprimer ce tarif ?">Suppr.</OpsSubmit>
                                </OpsForm>
                              </Td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  ) : <p className="mt-2 text-sm text-muted">Aucun tarif saisi.</p>}
                  {canUpdate ? (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-brand-600">Ajouter un tarif</summary>
                      <OpsForm action={saveRate} resetOnSuccess className="mt-2">
                        <input type="hidden" name="hotel_id" value={h.id} />
                        <div className="grid gap-3 md:grid-cols-5">
                          <Field label="Saison" htmlFor={`rs-${h.id}`} required><Input id={`rs-${h.id}`} name="season" placeholder="Été 2027" /></Field>
                          <Field label="Du" htmlFor={`rf-${h.id}`} required><Input id={`rf-${h.id}`} name="valid_from" type="date" /></Field>
                          <Field label="Au" htmlFor={`rt-${h.id}`} required><Input id={`rt-${h.id}`} name="valid_to" type="date" /></Field>
                          <Field label="Chambre" htmlFor={`rr-${h.id}`} required>
                            <Select id={`rr-${h.id}`} name="room_type" defaultValue={h.room_types[0] ?? ''}>{(h.room_types.length ? h.room_types : ['Double']).map((x) => <option key={x}>{x}</option>)}</Select>
                          </Field>
                          <Field label="Pension" htmlFor={`rb-${h.id}`} required>
                            <Select id={`rb-${h.id}`} name="board" defaultValue={h.boards[0] ?? 'DP'}>{(h.boards.length ? h.boards : Object.keys(boardLabels)).map((x) => <option key={x}>{x}</option>)}</Select>
                          </Field>
                          <Field label="Nature" htmlFor={`rk-${h.id}`}><Select id={`rk-${h.id}`} name="rate_kind" defaultValue="contract"><option value="contract">Contractuel</option><option value="spot">Ponctuel</option></Select></Field>
                          <Field label="Prix / nuit" htmlFor={`rp-${h.id}`} required><Input id={`rp-${h.id}`} name="price_per_night" type="number" step="0.001" min={0} /></Field>
                          <Field label="Suppl. single" htmlFor={`rss-${h.id}`}><Input id={`rss-${h.id}`} name="single_supplement" type="number" step="0.001" min={0} defaultValue={0} /></Field>
                          <Field label="Réduction enfant (%)" htmlFor={`rc-${h.id}`}><Input id={`rc-${h.id}`} name="child_discount_pct" type="number" step="0.01" min={0} max={100} defaultValue={0} /></Field>
                          <Field label="Devise" htmlFor={`rcur-${h.id}`}><Input id={`rcur-${h.id}`} name="currency" maxLength={3} defaultValue={s.currency} /></Field>
                        </div>
                        <OpsSubmit size="sm" variant="secondary">Ajouter le tarif</OpsSubmit>
                      </OpsForm>
                    </details>
                  ) : null}
                </div>
              )
            }) : <EmptyState title="Aucun hôtel rattaché" />}
            {canUpdate ? (
              <Disclosure summary="Ajouter un hôtel au référentiel">
                <OpsForm action={saveHotel} resetOnSuccess>
                  <input type="hidden" name="supplier_id" value={s.id} />
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Nom" htmlFor="h_name" required><Input id="h_name" name="name" /></Field>
                    <Field label="Ville" htmlFor="h_city" required><Input id="h_city" name="city" /></Field>
                    <Field label="Pays" htmlFor="h_country"><Input id="h_country" name="country" defaultValue={s.country ?? 'TN'} /></Field>
                    <Field label="Catégorie (étoiles)" htmlFor="h_cat"><Input id="h_cat" name="category" type="number" min={1} max={5} /></Field>
                    <Field label="Types de chambre" htmlFor="h_rooms" hint="Séparés par des virgules"><Input id="h_rooms" name="room_types" placeholder="Double, Single, Familiale" /></Field>
                    <Field label="Pensions" htmlFor="h_boards" hint="RO, LPD, DP, PC, ALL"><Input id="h_boards" name="boards" placeholder="LPD, DP, ALL" /></Field>
                    <Field label="Adresse" htmlFor="h_addr" className="md:col-span-2"><Input id="h_addr" name="address" /></Field>
                    <Field label="Règles enfants" htmlFor="h_child"><Input id="h_child" name="child_rules" /></Field>
                  </div>
                  <OpsSubmit variant="secondary">Ajouter l’hôtel</OpsSubmit>
                </OpsForm>
              </Disclosure>
            ) : null}
          </Section>
        ) : null}

        {services.data?.length ? (
          <Section title="Prestations récentes">
            <ul className="space-y-1 text-sm">
              {services.data.map((x) => <li key={x.id}><Link className="text-brand-600 hover:underline" href={`/dossiers/${x.dossier_id}/prestations/${x.id}`}>{(x.dossiers as { reference?: string } | null)?.reference} — {x.description}</Link> <span className="text-xs text-muted">{formatDateFr(x.start_date)} · {x.status}</span></li>)}
            </ul>
          </Section>
        ) : null}
      </div>
    </>
  )
}

function ContractForm({ supplierId, contract, currency }: {
  supplierId: string; currency: string
  contract?: { id: string; title: string; valid_from: string | null; valid_to: string | null; currency: string; child_rules: string | null; free_places: string | null; penalties: string | null; supplements: string; notes: string }
}) {
  const k = contract?.id ?? 'new'
  return (
    <OpsForm action={saveContract} resetOnSuccess={!contract} className="mt-2">
      {contract ? <input type="hidden" name="id" value={contract.id} /> : null}
      <input type="hidden" name="supplier_id" value={supplierId} />
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Intitulé" htmlFor={`ct-${k}`} required className="md:col-span-2"><Input id={`ct-${k}`} name="title" defaultValue={contract?.title ?? ''} /></Field>
        <Field label="Du" htmlFor={`cf-${k}`}><Input id={`cf-${k}`} name="valid_from" type="date" defaultValue={contract?.valid_from ?? ''} /></Field>
        <Field label="Au" htmlFor={`cto-${k}`}><Input id={`cto-${k}`} name="valid_to" type="date" defaultValue={contract?.valid_to ?? ''} /></Field>
        <Field label="Devise" htmlFor={`cc-${k}`}><Input id={`cc-${k}`} name="currency" maxLength={3} defaultValue={contract?.currency ?? currency} /></Field>
        <Field label="Conditions enfants" htmlFor={`cch-${k}`} className="md:col-span-3"><Input id={`cch-${k}`} name="child_rules" defaultValue={contract?.child_rules ?? ''} /></Field>
        <Field label="Gratuités" htmlFor={`cg-${k}`} className="md:col-span-2"><Input id={`cg-${k}`} name="free_places" defaultValue={contract?.free_places ?? ''} placeholder="Ex. 1 gratuité pour 20 payants" /></Field>
        <Field label="Suppléments" htmlFor={`cs-${k}`} className="md:col-span-2"><Input id={`cs-${k}`} name="supplements" defaultValue={contract?.supplements ?? ''} /></Field>
        <Field label="Pénalités d’annulation" htmlFor={`cp-${k}`} className="md:col-span-4"><Textarea id={`cp-${k}`} name="penalties" defaultValue={contract?.penalties ?? ''} className="min-h-14!" /></Field>
        <Field label="Notes" htmlFor={`cn-${k}`} className="md:col-span-4"><Input id={`cn-${k}`} name="notes" defaultValue={contract?.notes ?? ''} /></Field>
      </div>
      <OpsSubmit size="sm" variant="secondary">{contract ? 'Mettre à jour' : 'Ajouter le contrat'}</OpsSubmit>
    </OpsForm>
  )
}
