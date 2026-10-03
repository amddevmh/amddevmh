import Link from 'next/link'
import { formatDateFr, label } from '@hi/core'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, Td, Th } from '@hi/ui'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { TravellerFields } from '@/components/ops/traveller-fields'
import { Disclosure } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { addTraveller } from '@/lib/ops/actions/crm'
import { attachTraveller, updateDossierTraveller } from '@/lib/ops/actions/dossiers'
import { db } from '@/lib/ops/data'
import { getDossier } from '@/lib/ops/dossier'
import { paxTypeLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Dossier — voyageurs' }

export default async function TravellersTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('dossiers')
  const { id } = await params
  const d = await getDossier(id)
  const supabase = await db()
  const canIdentity = session.can('identity')
  const [{ data: links }, { data: clientTravellers }] = await Promise.all([
    supabase.from('dossier_travellers').select('*, travellers(*)').eq('dossier_id', id),
    supabase.from('travellers').select('id, first_name, last_name, pax_type').eq('client_id', d.client_id).order('last_name'),
  ])
  const ids = (links ?? []).map((l) => l.traveller_id)
  const { data: identity } = canIdentity && ids.length
    ? await supabase.from('traveller_identity_documents').select('traveller_id, doc_type, passport_number, expiry_date').in('traveller_id', ids)
    : { data: [] }
  const attached = new Set(ids)
  const available = (clientTravellers ?? []).filter((t) => !attached.has(t.id))
  const canUpdate = session.can('dossiers', 'update')
  const client = d.clients as { id: string; display_name: string | null } | null
  const expected = d.adults + d.children + d.infants
  const returnDate = d.end_date ?? d.start_date

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Client payeur : <Link className="font-semibold underline" href={`/crm/clients/${client?.id}`}>{client?.display_name}</Link> — le payeur n’est pas forcément voyageur.
        {' '}Voyageurs rattachés : {ids.length} / {expected} prévus.
      </Alert>
      {ids.length < expected ? <Alert tone="warning">Effectif à compléter : {expected - ids.length} voyageur(s) non nommé(s).</Alert> : null}
      <Card>
        <CardHeader title="Voyageurs du dossier" />
        <CardBody>
          {links?.length ? (
            <Table className="-mx-5">
              <thead><tr><Th>Voyageur</Th><Th>Type</Th><Th>Naissance</Th>{canIdentity ? <Th>Pièce d’identité</Th> : null}<Th>Chambre / demandes</Th></tr></thead>
              <tbody>
                {links.map((l) => {
                  const t = l.travellers as { id: string; first_name: string; last_name: string; pax_type: string; birth_date: string | null; nationality: string | null } | null
                  const docs = (identity ?? []).filter((x) => x.traveller_id === l.traveller_id)
                  return (
                    <tr key={l.traveller_id}>
                      <Td className="font-medium">{t?.first_name} {t?.last_name} {l.is_lead ? <Badge tone="brand">Principal</Badge> : null}<p className="text-xs text-muted">{t?.nationality}</p></Td>
                      <Td>{label(paxTypeLabels, t?.pax_type)}</Td>
                      <Td>{formatDateFr(t?.birth_date)}</Td>
                      {canIdentity ? (
                        <Td className="text-xs">
                          {docs.length ? docs.map((x, i) => (
                            <p key={i}>{x.doc_type === 'passport' ? 'Passeport' : 'Pièce'} {x.passport_number} — exp. {formatDateFr(x.expiry_date)}
                              {x.expiry_date && returnDate && x.expiry_date < returnDate ? <Badge tone="danger" className="ml-1">Expire avant le retour</Badge> : null}</p>
                          )) : <Badge tone="warning">Aucune pièce</Badge>}
                        </Td>
                      ) : null}
                      <Td>
                        {canUpdate ? (
                          <OpsForm action={updateDossierTraveller} inline>
                            <input type="hidden" name="dossier_id" value={id} />
                            <input type="hidden" name="traveller_id" value={l.traveller_id} />
                            <div className="flex flex-wrap items-center gap-2">
                              <Input name="room_label" defaultValue={l.room_label ?? ''} placeholder="Chambre (ex. DBL-1)" className="h-8! w-32! text-xs!" aria-label="Chambre" />
                              <Input name="special_requests" defaultValue={l.special_requests ?? ''} placeholder="Demandes particulières" className="h-8! w-48! text-xs!" aria-label="Demandes" />
                              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_lead" defaultChecked={l.is_lead} className="size-4" /> Principal</label>
                              <OpsSubmit size="sm" variant="ghost">OK</OpsSubmit>
                              <OpsSubmit size="sm" variant="ghost" name="remove" value="1" confirm="Retirer ce voyageur du dossier ?">Retirer</OpsSubmit>
                            </div>
                          </OpsForm>
                        ) : <span className="text-xs">{[l.room_label, l.special_requests].filter(Boolean).join(' — ') || '—'}</span>}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          ) : <EmptyState title="Aucun voyageur rattaché" description="Rattachez les voyageurs connus ; l’effectif peut rester à compléter." />}
        </CardBody>
      </Card>
      {canUpdate ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Rattacher un voyageur du client" />
            <CardBody>
              {available.length ? (
                <OpsForm action={attachTraveller}>
                  <input type="hidden" name="dossier_id" value={id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Voyageur" htmlFor="traveller_id" required>
                      <Select id="traveller_id" name="traveller_id" defaultValue="">
                        <option value="" disabled>Choisir…</option>
                        {available.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name} ({label(paxTypeLabels, t.pax_type)})</option>)}
                      </Select>
                    </Field>
                    <Field label="Chambre" htmlFor="room_label"><Input id="room_label" name="room_label" /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_lead" className="size-4" /> Voyageur principal</label>
                  <OpsSubmit variant="secondary">Rattacher</OpsSubmit>
                </OpsForm>
              ) : <p className="text-sm text-muted">Tous les voyageurs connus du client sont déjà rattachés.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Nouveau voyageur" description="Créé sur la fiche du client et rattaché à ce dossier." />
            <CardBody>
              <Disclosure summary="Saisir un voyageur">
                <OpsForm action={addTraveller} resetOnSuccess>
                  <input type="hidden" name="client_id" value={d.client_id} />
                  <input type="hidden" name="dossier_id" value={id} />
                  <TravellerFields />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_lead" className="size-4" /> Voyageur principal</label>
                  <OpsSubmit variant="secondary">Créer et rattacher</OpsSubmit>
                </OpsForm>
              </Disclosure>
              {canIdentity ? <p className="mt-2 text-xs text-muted">Les pièces d’identité se saisissent sur la fiche client (accès restreint).</p> : null}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
