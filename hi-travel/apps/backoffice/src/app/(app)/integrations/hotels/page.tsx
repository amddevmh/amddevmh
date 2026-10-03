import Link from 'next/link'
import { formatDateTimeFr } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, StatusBadge, Table, Td, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { HotelSearch } from '@/components/admin/hotel-search'
import { requireStaff } from '@/lib/auth'
import { CAPABILITY_LABELS, SIMULATION_MODES, loadHotelConnectors } from '@/lib/admin/hotels'
import { addDays } from '@hi/core'
import { todayTunis } from '@/lib/fin/format'
import { closeBookingManually, proposeMapping, reviewMapping, updateConnector } from './actions'

export const metadata = { title: 'API hôtels Tunisie' }

const BOOKING_STATUS: Record<string, string> = { sent: 'Envoyée', pending: 'En attente', confirmed: 'Confirmée', failed: 'Échec', to_verify: 'À vérifier', cancelled: 'Annulée' }

export default async function HotelConnectorsPage() {
  const session = await requireStaff('integrations', 'read')
  const supabase = await createClient()
  const canEdit = session.can('integrations', 'update')
  const [connectors, { data: hotels }, { data: mappings }, { data: logs }, { data: bookings }] = await Promise.all([
    loadHotelConnectors(supabase),
    supabase.from('hotels').select('id, name, city, country').eq('country', 'TN').eq('active', true).order('name'),
    supabase.from('hotel_mappings').select('id, hotel_id, provider, provider_hotel_code, provider_hotel_name, status, hotels(name, city)').order('created_at'),
    supabase.from('api_call_logs').select('*').order('created_at', { ascending: false }).limit(25),
    session.can('dossiers', 'read')
      ? supabase.from('hotel_booking_requests').select('id, request_id, connector_code, status, external_ref, amount, currency, attempts, last_error, created_at, service_id, dossiers(reference)').order('created_at', { ascending: false }).limit(15)
      : Promise.resolve({ data: [] as never[] }),
  ])
  const cities = [...new Set((hotels ?? []).map((h) => h.city).concat(['Hammamet', 'Sousse', 'Djerba', 'Monastir', 'Port El Kantaoui']))].sort()
  const start = addDays(todayTunis(), 30)

  return (
    <>
      <PageHeader
        title="API hôtels Tunisie"
        description="Deux connecteurs indépendants (API01–API04) : activation, matrice des capacités, scénarios de simulation, recherche comparée, correspondance des hôtels et journal technique masqué."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {connectors.map((c) => (
          <Card key={c.code}>
            <CardHeader
              title={c.label}
              description={<span className="font-mono">{c.code}</span>}
              actions={<><Badge tone={c.enabled ? 'success' : 'neutral'}>{c.enabled ? 'Activé' : 'Désactivé'}</Badge><Badge tone="info">Mode {c.mode}</Badge>{c.config?.simulate && c.config.simulate !== 'ok' ? <Badge tone="warning">Simulation : {SIMULATION_MODES[c.config.simulate]}</Badge> : null}</>}
            />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(CAPABILITY_LABELS).map(([k, l]) => (
                  <Badge key={k} tone={c.capabilities?.[k] ? 'success' : 'neutral'}>{c.capabilities?.[k] ? '✓' : '✕'} {l}</Badge>
                ))}
              </div>
              {c.notes ? <p className="text-xs text-muted">{c.notes}</p> : null}
              <p className="text-xs text-muted">Les opérations non disponibles par API suivent le parcours manuel. Identifiants stockés côté serveur uniquement (jamais en base ni sur le site).</p>
              {canEdit ? (
                <ActionForm action={updateConnector}>
                  <input type="hidden" name="code" value={c.code} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Activation" htmlFor={`en-${c.code}`}>
                      <Select id={`en-${c.code}`} name="enabled" defaultValue={c.enabled ? '1' : '0'}><option value="1">Activé</option><option value="0">Désactivé</option></Select>
                    </Field>
                    <Field label="Environnement" htmlFor={`mode-${c.code}`}>
                      <Select id={`mode-${c.code}`} name="mode" defaultValue={c.mode}><option value="mock">Simulé</option><option value="test">Test</option><option value="live">Production</option></Select>
                    </Field>
                    <Field label="Scénario (recette)" htmlFor={`sim-${c.code}`}>
                      <Select id={`sim-${c.code}`} name="simulate" defaultValue={c.config?.simulate ?? 'ok'}>
                        {Object.entries(SIMULATION_MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <SubmitButton size="sm" variant="secondary">Enregistrer</SubmitButton>
                </ActionForm>
              ) : <p className="text-xs text-muted">Configuration modifiable par la direction (droit connexions : modifier).</p>}
            </CardBody>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-brand-900">Recherche comparée</h2>
      <div className="mb-8">
        <HotelSearch
          hotels={(hotels ?? []).map((h) => ({ id: h.id, name: h.name, city: h.city }))}
          cities={cities}
          defaults={{ city: 'Hammamet', checkIn: start, checkOut: addDays(start, 3), adults: 2, children: 0 }}
        />
      </div>

      {(bookings ?? []).length ? (
        <Card className="mb-6">
          <CardHeader title="Demandes de réservation API" description="Identifiant unique par demande ; une demande « à vérifier » n’est jamais renvoyée sans contrôle du statut." />
          <Table>
            <thead><tr><Th>Date</Th><Th>Dossier</Th><Th>Connecteur</Th><Th>Statut</Th><Th>Réf. externe</Th><Th>Tentatives</Th><Th>Détail</Th><Th /></tr></thead>
            <tbody>
              {(bookings ?? []).map((b) => (
                <tr key={b.id}>
                  <Td className="text-xs">{formatDateTimeFr(b.created_at)}</Td>
                  <Td>{b.dossiers?.reference}</Td>
                  <Td className="font-mono text-xs">{b.connector_code}</Td>
                  <Td><StatusBadge status={b.status} labels={BOOKING_STATUS} /></Td>
                  <Td className="font-mono text-xs">{b.external_ref ?? '—'}</Td>
                  <Td className="text-right">{b.attempts}</Td>
                  <Td className="max-w-xs text-xs text-muted">{b.last_error}</Td>
                  <Td className="space-y-1">
                    {b.service_id ? <Link className="text-xs text-brand-600 hover:underline" href={`/integrations/hotels/reserver?service=${b.service_id}`}>Ouvrir</Link> : null}
                    {b.status === 'to_verify' && session.can('dossiers', 'update') ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-brand-600">Clôture manuelle</summary>
                        <ActionForm action={closeBookingManually} className="mt-1 w-56">
                          <input type="hidden" name="id" value={b.id} />
                          <Select name="status" aria-label="Statut constaté"><option value="confirmed">Confirmée chez le fournisseur</option><option value="failed">Non réservée</option><option value="cancelled">Annulée</option></Select>
                          <Input name="external_ref" placeholder="Référence fournisseur" />
                          <SubmitButton size="sm" confirm="Enregistrer le statut constaté auprès du fournisseur ?">Enregistrer</SubmitButton>
                        </ActionForm>
                      </details>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Correspondance des hôtels" description="Un même hôtel chez les deux fournisseurs ; les rapprochements ambigus sont proposés puis validés." />
          {(mappings ?? []).length === 0 ? <EmptyState title="Aucune correspondance" /> : (
            <Table>
              <thead><tr><Th>Hôtel HI Travel</Th><Th>Fournisseur</Th><Th>Code / nom fournisseur</Th><Th>Statut</Th>{canEdit ? <Th /> : null}</tr></thead>
              <tbody>
                {(mappings ?? []).map((m) => (
                  <tr key={m.id}>
                    <Td>{m.hotels?.name}<span className="block text-xs text-muted">{m.hotels?.city}</span></Td>
                    <Td className="font-mono text-xs">{m.provider}</Td>
                    <Td className="text-xs"><span className="font-mono">{m.provider_hotel_code}</span><span className="block text-muted">{m.provider_hotel_name}</span></Td>
                    <Td><Badge tone={m.status === 'validated' ? 'success' : m.status === 'proposed' ? 'warning' : 'danger'}>{m.status === 'validated' ? 'Validée' : m.status === 'proposed' ? 'À valider' : 'Rejetée'}</Badge></Td>
                    {canEdit ? (
                      <Td>
                        {m.status === 'proposed' ? (
                          <div className="flex gap-1">
                            <ActionForm action={reviewMapping}><input type="hidden" name="id" value={m.id} /><SubmitButton size="sm" name="status" value="validated">Valider</SubmitButton></ActionForm>
                            <ActionForm action={reviewMapping}><input type="hidden" name="id" value={m.id} /><SubmitButton size="sm" variant="ghost" name="status" value="rejected">Rejeter</SubmitButton></ActionForm>
                          </div>
                        ) : null}
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {canEdit ? (
            <CardBody className="border-t border-line">
              <ActionForm action={proposeMapping} resetOnSuccess>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Hôtel" htmlFor="m-hotel"><Select id="m-hotel" name="hotel_id">{(hotels ?? []).map((h) => <option key={h.id} value={h.id}>{h.name} ({h.city})</option>)}</Select></Field>
                  <Field label="Fournisseur" htmlFor="m-prov"><Select id="m-prov" name="provider">{connectors.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</Select></Field>
                  <Field label="Code fournisseur" htmlFor="m-code" required><Input id="m-code" name="provider_hotel_code" placeholder="TB-… / MG-…" required /></Field>
                  <Field label="Nom chez le fournisseur" htmlFor="m-name"><Input id="m-name" name="provider_hotel_name" /></Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton size="sm" variant="secondary">Proposer</SubmitButton>
                  <SubmitButton size="sm" name="validate" value="1">Proposer et valider</SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Journal technique" description="25 derniers appels ; données personnelles et secrets masqués (API04)." />
          {(logs ?? []).length === 0 ? <EmptyState title="Aucun appel journalisé" /> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Connecteur</Th><Th>Opération</Th><Th>Statut</Th><Th className="text-right">Durée</Th><Th>Détail</Th></tr></thead>
              <tbody>
                {(logs ?? []).map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap text-xs">{formatDateTimeFr(l.created_at)}</Td>
                    <Td className="font-mono text-xs">{l.connector_code.replace('hotel_api_', '')}</Td>
                    <Td className="text-xs">{l.operation}</Td>
                    <Td><Badge tone={l.status === 'success' ? 'success' : l.status === 'timeout' ? 'warning' : 'danger'}>{l.status}</Badge></Td>
                    <Td className="text-right text-xs tabular">{l.duration_ms ?? '—'} ms</Td>
                    <Td className="max-w-[260px] text-[11px] text-muted">
                      {l.error_message ? <span className="text-danger-700">{l.error_message}</span> : null}
                      <details><summary className="cursor-pointer">requête</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(l.request_summary)}</pre></details>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
