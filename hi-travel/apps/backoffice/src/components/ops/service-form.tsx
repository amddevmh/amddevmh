import { boardLabels } from '@hi/core'
import type { Tables } from '@hi/db'
import { Field, Input, Select, Textarea } from '@hi/ui'
import { saveService } from '@/lib/ops/actions/dossiers'
import { detail, isoToZonedLocal } from '@/lib/ops/format'
import { paxTypeLabels } from '@/lib/ops/labels'
import { OpsForm, OpsSubmit } from './ops-form'

type Service = Tables<'services'>

const TIMEZONES = ['Africa/Tunis', 'Europe/Paris', 'Europe/Istanbul', 'Asia/Riyadh', 'Africa/Cairo', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'UTC']
const EVENT_ITEMS = ['Salle / espace', 'Restauration', 'Pause café', 'Audiovisuel', 'Éclairage', 'Scénographie', 'Stand', 'Animation', 'Interprétation', 'Guide', 'Personnel', 'Sécurité', 'Transport', 'Autre']

/** Formulaire de prestation : champs communs + champs propres au type (hôtel, transfert, événement…). */
export function ServiceForm({ dossierId, activity, serviceType, service, suppliers, hotels, linkable, canMargins, defaults }: {
  dossierId: string
  activity: string
  serviceType: string
  service?: Service | null
  suppliers: Array<{ id: string; name: string; currency: string }>
  hotels: Array<{ id: string; name: string; city: string; country: string }>
  linkable: Array<{ id: string; description: string; service_type: string }>
  canMargins: boolean
  defaults?: { start_date?: string | null; end_date?: string | null }
}) {
  const s = service
  const tz = s?.local_timezone ?? 'Africa/Tunis'
  const d = (k: string) => detail(s?.details, k)
  const isHotel = serviceType === 'hotel'
  const isTransfer = serviceType === 'transfer' || serviceType === 'transport'
  const isEvent = serviceType === 'event_item'
  const timed = isTransfer || isEvent || serviceType === 'excursion'
  const hotelOptions = hotels.filter((h) => (activity === 'hotel_tn' ? h.country === 'TN' : activity === 'hotel_intl' ? h.country !== 'TN' : true))

  return (
    <OpsForm action={saveService}>
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <input type="hidden" name="dossier_id" value={dossierId} />
      <input type="hidden" name="activity" value={activity} />
      <input type="hidden" name="service_type" value={serviceType} />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Description" htmlFor="description" required className="md:col-span-2">
          <Input id="description" name="description" defaultValue={s?.description ?? ''} placeholder={isHotel ? 'Ex. Marina Palace — 7 nuits DP, chambre double' : isTransfer ? 'Ex. Transfert aéroport → hôtel' : ''} />
        </Field>
        <Field label="Fournisseur" htmlFor="supplier_id">
          <Select id="supplier_id" name="supplier_id" defaultValue={s?.supplier_id ?? ''}>
            <option value="">— À préciser —</option>
            {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>

        {isHotel ? (
          <>
            <Field label="Hôtel (référentiel)" htmlFor="hotel_id">
              <Select id="hotel_id" name="hotel_id" defaultValue={s?.hotel_id ?? ''}>
                <option value="">— Hors référentiel —</option>
                {hotelOptions.map((h) => <option key={h.id} value={h.id}>{h.name} — {h.city}</option>)}
              </Select>
            </Field>
            <Field label="Arrivée" htmlFor="start_date" required><Input id="start_date" name="start_date" type="date" defaultValue={s?.start_date ?? defaults?.start_date ?? ''} /></Field>
            <Field label="Départ de l’hôtel" htmlFor="end_date" required hint={s?.nights != null ? `${s.nights} nuitée(s) calculée(s) à partir des dates` : 'Nuitées calculées à partir des dates'}>
              <Input id="end_date" name="end_date" type="date" defaultValue={s?.end_date ?? defaults?.end_date ?? ''} />
            </Field>
            <Field label="Type de chambre" htmlFor="room_type"><Input id="room_type" name="room_type" defaultValue={s?.room_type ?? ''} placeholder="Double, single, familiale…" /></Field>
            <Field label="Pension" htmlFor="board">
              <Select id="board" name="board" defaultValue={s?.board ?? ''}>
                <option value="">—</option>
                {Object.entries(boardLabels).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
              </Select>
            </Field>
            <Field label="Occupation" htmlFor="occupancy"><Input id="occupancy" name="occupancy" defaultValue={s?.occupancy ?? ''} placeholder="2 adultes + 1 enfant (8 ans)" /></Field>
            <Field label="Nombre de chambres" htmlFor="rooms"><Input id="rooms" name="rooms" type="number" min={1} defaultValue={d('rooms')} /></Field>
            {activity === 'hotel_intl' ? (
              <>
                <Field label="Pays" htmlFor="country"><Input id="country" name="country" defaultValue={d('country')} /></Field>
                <Field label="Ville" htmlFor="city"><Input id="city" name="city" defaultValue={d('city')} /></Field>
              </>
            ) : null}
          </>
        ) : timed ? (
          <>
            <Field label={isTransfer ? 'Prise en charge (heure locale)' : 'Début (heure locale)'} htmlFor="start_at" required={isTransfer}>
              <Input id="start_at" name="start_at" type="datetime-local" defaultValue={isoToZonedLocal(s?.start_at, tz)} />
            </Field>
            <Field label="Fin (heure locale)" htmlFor="end_at"><Input id="end_at" name="end_at" type="datetime-local" defaultValue={isoToZonedLocal(s?.end_at, tz)} /></Field>
            <Field label="Fuseau horaire local" htmlFor="local_timezone">
              <Select id="local_timezone" name="local_timezone" defaultValue={tz}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Du" htmlFor="start_date"><Input id="start_date" name="start_date" type="date" defaultValue={s?.start_date ?? defaults?.start_date ?? ''} /></Field>
            <Field label="Au" htmlFor="end_date"><Input id="end_date" name="end_date" type="date" defaultValue={s?.end_date ?? defaults?.end_date ?? ''} /></Field>
            {serviceType === 'flight' ? <p className="self-end pb-2 text-xs text-muted">Segments (horaires locaux et fuseaux), PNR et billets se saisissent après création.</p> : null}
          </>
        )}

        {isTransfer ? (
          <>
            <Field label="Lieu de prise en charge" htmlFor="pickup"><Input id="pickup" name="pickup" defaultValue={d('pickup')} placeholder="Aéroport Tunis-Carthage, terminal 1" /></Field>
            <Field label="Destination" htmlFor="dropoff"><Input id="dropoff" name="dropoff" defaultValue={d('dropoff')} /></Field>
            <Field label="Nombre de passagers" htmlFor="pax_count"><Input id="pax_count" name="pax_count" type="number" min={1} defaultValue={d('pax_count')} /></Field>
            <Field label="Véhicule (immatriculation / identifiant)" htmlFor="vehicle" hint="Sert au contrôle des chevauchements"><Input id="vehicle" name="vehicle" defaultValue={d('vehicle')} /></Field>
            <Field label="Capacité du véhicule" htmlFor="vehicle_capacity"><Input id="vehicle_capacity" name="vehicle_capacity" type="number" min={1} defaultValue={d('vehicle_capacity')} /></Field>
            <Field label="Chauffeur" htmlFor="driver"><Input id="driver" name="driver" defaultValue={d('driver')} /></Field>
            <Field label="Téléphone chauffeur / contact" htmlFor="driver_phone"><Input id="driver_phone" name="driver_phone" defaultValue={d('driver_phone')} /></Field>
            <Field label="Vol lié" htmlFor="linked_service_id" hint="Une modification du vol signalera ce transfert à revoir">
              <Select id="linked_service_id" name="linked_service_id" defaultValue={s?.linked_service_id ?? ''}>
                <option value="">— Aucun —</option>
                {linkable.filter((x) => x.id !== s?.id).map((x) => <option key={x.id} value={x.id}>{x.description}</option>)}
              </Select>
            </Field>
          </>
        ) : null}

        {isEvent ? (
          <>
            <Field label="Poste" htmlFor="item_kind">
              <Select id="item_kind" name="item_kind" defaultValue={d('item_kind')}>
                <option value="">—</option>{EVENT_ITEMS.map((x) => <option key={x}>{x}</option>)}
              </Select>
            </Field>
            <Field label="Lieu / espace" htmlFor="venue"><Input id="venue" name="venue" defaultValue={d('venue')} /></Field>
            <Field label="Capacité" htmlFor="capacity" hint="Comparée au nombre de participants"><Input id="capacity" name="capacity" type="number" min={0} defaultValue={d('capacity')} /></Field>
          </>
        ) : null}

        {!isTransfer && !isHotel ? (
          <Field label="Prestation liée" htmlFor="linked_service_id">
            <Select id="linked_service_id" name="linked_service_id" defaultValue={s?.linked_service_id ?? ''}>
              <option value="">— Aucune —</option>
              {linkable.filter((x) => x.id !== s?.id).map((x) => <option key={x.id} value={x.id}>{x.description}</option>)}
            </Select>
          </Field>
        ) : null}

        <Field label="Voyageurs concernés" htmlFor="pax_type">
          <Select id="pax_type" name="pax_type" defaultValue={s?.pax_type ?? 'all'}>
            {Object.entries(paxTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Quantité" htmlFor="quantity"><Input id="quantity" name="quantity" type="number" min={0.01} step="0.01" defaultValue={s?.quantity ?? 1} /></Field>
        <Field label="Prix de vente (DT)" htmlFor="sale_price"><Input id="sale_price" name="sale_price" type="number" min={0} step="0.001" defaultValue={s?.sale_price ?? 0} /></Field>

        {canMargins ? (
          <>
            <Field label="Coût prévu (devise d’achat)" htmlFor="cost_planned"><Input id="cost_planned" name="cost_planned" type="number" min={0} step="0.001" defaultValue={s?.cost_planned ?? 0} /></Field>
            <Field label="Coût confirmé" htmlFor="cost_confirmed" hint="Laisser vide tant que non confirmé"><Input id="cost_confirmed" name="cost_confirmed" type="number" min={0} step="0.001" defaultValue={s?.cost_confirmed ?? ''} /></Field>
            <Field label="Devise d’achat" htmlFor="cost_currency">
              <Select id="cost_currency" name="cost_currency" defaultValue={s?.cost_currency ?? 'TND'}>{['TND', 'EUR', 'USD', 'SAR', 'TRY', 'GBP'].map((c) => <option key={c}>{c}</option>)}</Select>
            </Field>
            <Field label="Taux de conversion → TND" htmlFor="fx_rate"><Input id="fx_rate" name="fx_rate" type="number" min={0.000001} step="0.000001" defaultValue={s?.fx_rate ?? 1} /></Field>
            <Field label="Date du taux" htmlFor="fx_rate_date"><Input id="fx_rate_date" name="fx_rate_date" type="date" defaultValue={s?.fx_rate_date ?? ''} /></Field>
            <Field label="Source du taux" htmlFor="fx_rate_source"><Input id="fx_rate_source" name="fx_rate_source" defaultValue={s?.fx_rate_source ?? ''} placeholder="BCT, fournisseur…" /></Field>
          </>
        ) : null}

        <Field label="Référence externe / fournisseur" htmlFor="external_ref"><Input id="external_ref" name="external_ref" defaultValue={s?.external_ref ?? ''} /></Field>
        <Field label="Conditions d’annulation" htmlFor="cancellation_terms" className="md:col-span-2"><Textarea id="cancellation_terms" name="cancellation_terms" defaultValue={s?.cancellation_terms ?? ''} className="min-h-14!" /></Field>
        <Field label="Notes opérationnelles" htmlFor="notes" className="md:col-span-3"><Textarea id="notes" name="notes" defaultValue={d('notes')} className="min-h-14!" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_mandatory" defaultChecked={s?.is_mandatory ?? true} className="size-4" /> Prestation obligatoire (doit être confirmée avant la confirmation du dossier)
      </label>
      <OpsSubmit>{s ? 'Enregistrer la prestation' : 'Créer la prestation'}</OpsSubmit>
    </OpsForm>
  )
}
