import { formatDateTimeFr, label } from '@hi/core'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, Td, Th, buttonClass } from '@hi/ui'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { Disclosure } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { addParticipant, importParticipants, updateParticipant } from '@/lib/ops/actions/dossiers'
import { db } from '@/lib/ops/data'
import { getDossier, getDossierServices } from '@/lib/ops/dossier'
import { detail } from '@/lib/ops/format'
import { attendanceLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Dossier — participants' }

export default async function ParticipantsTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('dossiers')
  const { id } = await params
  const d = await getDossier(id)
  const supabase = await db()
  const [{ data: participants }, services] = await Promise.all([
    supabase.from('event_participants').select('*').eq('dossier_id', id).order('full_name'),
    getDossierServices(id),
  ])
  const list = participants ?? []
  const active = list.filter((p) => p.attendance !== 'cancelled')
  const forecast = d.adults + d.children
  const venues = services.filter((s) => s.status !== 'cancelled' && Number(detail(s.details, 'capacity')) > 0)
    .map((s) => ({ s, cap: Number(detail(s.details, 'capacity')) }))
  const over = venues.filter((v) => active.length > v.cap)
  const canUpdate = session.can('dossiers', 'update')
  const counts = Object.keys(attendanceLabels).map((k) => [k, list.filter((p) => p.attendance === k).length] as const)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-4"><p className="text-xs text-muted">Participants actifs</p><p className="font-display text-2xl font-semibold text-brand-900">{active.length}</p></div>
        <div className="rounded-card border border-line bg-surface p-4"><p className="text-xs text-muted">Effectif prévisionnel du dossier</p><p className="font-display text-2xl font-semibold text-brand-900">{forecast}</p></div>
        <div className="rounded-card border border-line bg-surface p-4"><p className="text-xs text-muted">Capacités déclarées</p><p className="text-sm">{venues.length ? venues.map((v) => `${detail(v.s.details, 'venue') || v.s.description} : ${v.cap}`).join(' · ') : 'Aucune (saisir la capacité sur les prestations événement)'}</p></div>
      </div>
      {active.length > forecast ? <Alert tone="warning" title="Effectif supérieur au prévisionnel">{active.length} participants actifs pour {forecast} prévus : postes variables et engagements fournisseurs à revoir (aucune modification automatique des contrats).</Alert> : null}
      {over.map((v) => <Alert key={v.s.id} tone="danger" title="Capacité insuffisante">{detail(v.s.details, 'venue') || v.s.description} : capacité {v.cap} pour {active.length} participants actifs.</Alert>)}

      <Card>
        <CardHeader title={`Participants (${list.length})`} description={counts.filter(([, n]) => n).map(([k, n]) => `${label(attendanceLabels, k)} : ${n}`).join(' · ')}
          actions={session.can('dossiers', 'export') ? <a className={buttonClass('secondary', 'sm')} href={`/dossiers/${id}/participants/export`}>Exporter (CSV)</a> : null} />
        <CardBody>
          {list.length ? (
            <Table className="-mx-5">
              <thead><tr><Th>Participant</Th><Th>Entreprise / groupe</Th><Th>Contact</Th><Th>Arrivée / départ</Th><Th>Besoins</Th><Th>Présence</Th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={p.attendance === 'cancelled' ? 'opacity-60' : undefined}>
                    <Td className="font-medium">{p.full_name}</Td>
                    <Td>{p.company ?? '—'}<p className="text-xs text-muted">{p.group_label}</p></Td>
                    <Td className="text-xs">{p.email}<br />{p.phone}</Td>
                    <Td className="text-xs">{formatDateTimeFr(p.arrival_at)}<br />{formatDateTimeFr(p.departure_at)}</Td>
                    <Td className="text-xs">{[p.room_needs, p.constraints].filter(Boolean).join(' — ') || '—'}</Td>
                    <Td>
                      {canUpdate ? (
                        <OpsForm action={updateParticipant} inline>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="group_label" value={p.group_label ?? ''} />
                          <input type="hidden" name="room_needs" value={p.room_needs ?? ''} />
                          <div className="flex items-center gap-1">
                            <Select name="attendance" defaultValue={p.attendance} className="h-8! w-auto! text-xs!" aria-label="Présence">
                              {Object.entries(attendanceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </Select>
                            <OpsSubmit size="sm" variant="ghost" pendingLabel="…">OK</OpsSubmit>
                          </div>
                        </OpsForm>
                      ) : <Badge>{label(attendanceLabels, p.attendance)}</Badge>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="Aucun participant" description="Ajoutez les participants ou importez une liste CSV." />}
        </CardBody>
      </Card>

      {canUpdate ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Importer une liste (CSV)" description="Colonnes : nom, email, telephone, entreprise, groupe, chambre, contraintes. Séparateur virgule ou point-virgule. Doublons d’e-mail écartés." />
            <CardBody>
              <OpsForm action={importParticipants} resetOnSuccess>
                <input type="hidden" name="dossier_id" value={id} />
                <Field label="Fichier CSV" htmlFor="file" required><Input id="file" name="file" type="file" accept=".csv,text/csv" className="h-auto! py-1.5" /></Field>
                <OpsSubmit variant="secondary">Importer</OpsSubmit>
              </OpsForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Ajouter un participant" />
            <CardBody>
              <Disclosure summary="Saisir un participant" open>
                <OpsForm action={addParticipant} resetOnSuccess>
                  <input type="hidden" name="dossier_id" value={id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nom complet" htmlFor="full_name" required><Input id="full_name" name="full_name" /></Field>
                    <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" /></Field>
                    <Field label="Téléphone" htmlFor="phone"><Input id="phone" name="phone" /></Field>
                    <Field label="Entreprise" htmlFor="company"><Input id="company" name="company" /></Field>
                    <Field label="Groupe / atelier" htmlFor="group_label"><Input id="group_label" name="group_label" /></Field>
                    <Field label="Besoin de chambre" htmlFor="room_needs"><Input id="room_needs" name="room_needs" placeholder="Single, twin…" /></Field>
                    <Field label="Arrivée" htmlFor="arrival_at"><Input id="arrival_at" name="arrival_at" type="datetime-local" /></Field>
                    <Field label="Départ" htmlFor="departure_at"><Input id="departure_at" name="departure_at" type="datetime-local" /></Field>
                    <Field label="Contraintes utiles" htmlFor="constraints" className="sm:col-span-2"><Input id="constraints" name="constraints" placeholder="Régime alimentaire, mobilité…" /></Field>
                  </div>
                  <OpsSubmit variant="secondary">Ajouter</OpsSubmit>
                </OpsForm>
              </Disclosure>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
