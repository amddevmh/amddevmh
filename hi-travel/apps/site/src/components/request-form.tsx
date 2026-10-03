'use client'

import { startTransition, useActionState, useState, type FormEvent } from 'react'
import type { Activity } from '@hi/core'
import { Alert, Button, Input, Select, Textarea, buttonClass } from '@hi/ui'
import { submitRequest } from '@/actions/requests'
import { formVariantByActivity } from '@/lib/activities'
import { idleState, type RequestFormState } from '@/lib/forms'
import { t } from '@/lib/i18n'
import { Fieldset, FormField, a11yProps } from './form-field'
import { ConsentFields, ContactFields } from './request-fields'

export interface DepartureChoice {
  id: string
  label: string
  bookable: boolean
}

export interface RequestFormProps {
  activity: Activity
  token: string
  category?: 'omra'
  offer?: { id: string; title: string }
  departures?: DepartureChoice[]
  defaults?: { destination?: string; departure_id?: string; date_from?: string; date_to?: string; city?: string }
  contact: { phoneHref?: string; whatsappHref?: string; phone?: string | null }
  minDate: string
  idPrefix?: string
}

const BOARDS = ['LPD', 'DP', 'PC', 'ALL'] as const
const boardLabel: Record<string, string> = { LPD: 'Logement petit-déjeuner', DP: 'Demi-pension', PC: 'Pension complète', ALL: 'All inclusive' }

/** Formulaire de demande adapté à l'activité (FO04). */
export function RequestForm(props: RequestFormProps) {
  const { activity, token, category, offer, departures, defaults, contact, minDate, idPrefix = 'req' } = props
  const variant = formVariantByActivity[activity]
  const f = t.form
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(submitRequest, idleState)
  const [children, setChildren] = useState(0)
  const [tripType, setTripType] = useState('round_trip')
  const err = state.status === 'error' ? state.fieldErrors : undefined
  const id = (n: string) => `${idPrefix}-${n}`

  // Envoi via transition : le formulaire n'est pas vidé en cas d'erreur (sans JavaScript, l'envoi natif reste possible)
  function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (pending) return
    const fd = new FormData(ev.currentTarget)
    startTransition(() => formAction(fd))
  }

  if (state.status === 'success') {
    return (
      <div className="rounded-card border border-success-600/30 bg-success-50 p-6" role="status" aria-live="polite">
        <h3 className="font-display text-xl font-semibold text-brand-900">{f.ack.title}</h3>
        {state.reference ? (
          <p className="mt-3 text-sm text-ink">
            {f.ack.reference} :{' '}
            <strong className="font-display text-lg text-brand-700" data-testid="request-reference">{state.reference}</strong>
          </p>
        ) : null}
        <p className="mt-3 text-sm text-ink">{f.ack.text}</p>
        {state.duplicate ? <p className="mt-2 text-sm text-muted">{f.ack.duplicate}</p> : null}
        <p className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-sm font-medium text-warning-600 ring-1 ring-warning-600/20">{f.ack.notBooking}</p>
        {state.reference ? <p className="mt-3 text-xs text-muted">{f.ack.keep}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          {contact.phoneHref ? <a className={buttonClass('secondary', 'md')} href={contact.phoneHref}>{t.cta.call} {contact.phone}</a> : null}
          <button type="button" className={buttonClass('ghost', 'md')} onClick={() => window.location.reload()}>{f.ack.newRequest}</button>
        </div>
      </div>
    )
  }

  const childAges = Array.from({ length: children }, (_, i) => i)

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="relative space-y-8" aria-describedby={id('legend')}>
      <p id={id('legend')} className="text-xs text-muted">{f.requiredLegend}</p>
      {state.status === 'error' && state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="activity" value={activity} />
      <input type="hidden" name="submission_token" value={token} />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {offer ? <input type="hidden" name="offer_id" value={offer.id} /> : null}

      <ContactFields prefix={idPrefix} errors={err} />

      <Fieldset legend={f.tripSection}>
        {offer ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            {f.offer} : <strong>{offer.title}</strong>
          </p>
        ) : null}

        {departures && departures.length > 0 ? (
          <FormField id={id('departure_id')} label={f.departure} error={err?.departure_id}>
            <Select name="departure_id" defaultValue={defaults?.departure_id ?? ''} {...a11yProps(id('departure_id'), err?.departure_id)}>
              <option value="">{f.noDeparture}</option>
              {departures.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.bookable}>{d.label}</option>
              ))}
            </Select>
          </FormField>
        ) : null}

        {variant === 'generic' && !offer ? (
          <FormField id={id('destination')} label={f.destination} error={err?.destination}>
            <Input name="destination" defaultValue={defaults?.destination} maxLength={200} {...a11yProps(id('destination'), err?.destination)} />
          </FormField>
        ) : null}
        {variant === 'generic' && offer ? <input type="hidden" name="destination" value={defaults?.destination ?? ''} /> : null}

        {variant === 'hotel' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={id('city')} label={f.city} required error={err?.city}>
              <Input name="city" defaultValue={defaults?.city ?? defaults?.destination} required maxLength={120} {...a11yProps(id('city'), err?.city)} />
            </FormField>
            <FormField id={id('hotel_name')} label={f.hotelName} hint={f.hotelNameHint} error={err?.hotel_name}>
              <Input name="hotel_name" maxLength={160} {...a11yProps(id('hotel_name'), err?.hotel_name, f.hotelNameHint)} />
            </FormField>
            <FormField id={id('rooms')} label={f.rooms} error={err?.rooms}>
              <Input name="rooms" type="number" min={1} max={20} defaultValue={1} {...a11yProps(id('rooms'), err?.rooms)} />
            </FormField>
            <FormField id={id('board')} label={f.board} error={err?.board}>
              <Select name="board" defaultValue="" {...a11yProps(id('board'), err?.board)}>
                <option value="">{f.anyBoard}</option>
                {BOARDS.map((b) => <option key={b} value={b}>{boardLabel[b]}</option>)}
              </Select>
            </FormField>
          </div>
        ) : null}

        {variant === 'visa' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id={id('visa_country')} label={f.visaCountry} required error={err?.visa_country}>
              <Input name="visa_country" required maxLength={120} {...a11yProps(id('visa_country'), err?.visa_country)} />
            </FormField>
            <FormField id={id('visa_type')} label={f.visaType} required error={err?.visa_type}>
              <Select name="visa_type" required defaultValue="" {...a11yProps(id('visa_type'), err?.visa_type)}>
                <option value="" disabled>—</option>
                {f.visaTypes.map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            </FormField>
            <FormField id={id('applicants')} label={f.applicants} required error={err?.applicants}>
              <Input name="applicants" type="number" min={1} max={50} defaultValue={1} required {...a11yProps(id('applicants'), err?.applicants)} />
            </FormField>
            <p className="text-sm text-muted sm:col-span-3">{f.visaNote}</p>
          </div>
        ) : null}

        {variant === 'ticketing' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={id('from_city')} label={f.fromCity} required error={err?.from_city}>
              <Input name="from_city" required defaultValue="Tunis" maxLength={120} {...a11yProps(id('from_city'), err?.from_city)} />
            </FormField>
            <FormField id={id('to_city')} label={f.toCity} required error={err?.to_city}>
              <Input name="to_city" required maxLength={120} {...a11yProps(id('to_city'), err?.to_city)} />
            </FormField>
            <FormField id={id('trip_type')} label={f.tripType}>
              <Select name="trip_type" value={tripType} onChange={(e) => setTripType(e.target.value)} id={id('trip_type')}>
                {Object.entries(f.tripTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </FormField>
            <FormField id={id('cabin')} label={f.cabin}>
              <Select name="cabin" defaultValue={f.cabins[0]} id={id('cabin')}>
                {f.cabins.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormField>
          </div>
        ) : null}

        {variant === 'transport' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={id('pickup')} label={f.pickup} required error={err?.pickup}>
              <Input name="pickup" required maxLength={200} placeholder="Aéroport Tunis-Carthage" {...a11yProps(id('pickup'), err?.pickup)} />
            </FormField>
            <FormField id={id('dropoff')} label={f.dropoff} required error={err?.dropoff}>
              <Input name="dropoff" required maxLength={200} {...a11yProps(id('dropoff'), err?.dropoff)} />
            </FormField>
            <FormField id={id('pickup_at')} label={f.pickupAt} required error={err?.pickup_at}>
              <Input name="pickup_at" type="datetime-local" required min={`${minDate}T00:00`} {...a11yProps(id('pickup_at'), err?.pickup_at)} />
            </FormField>
            <FormField id={id('passengers')} label={f.passengers} required error={err?.passengers}>
              <Input name="passengers" type="number" min={1} max={200} defaultValue={1} required {...a11yProps(id('passengers'), err?.passengers)} />
            </FormField>
          </div>
        ) : null}

        {variant === 'mice' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={id('company')} label={f.company} required error={err?.company}>
              <Input name="company" required autoComplete="organization" maxLength={160} {...a11yProps(id('company'), err?.company)} />
            </FormField>
            <FormField id={id('event_format')} label={f.eventFormat} required error={err?.event_format}>
              <Select name="event_format" required defaultValue="" {...a11yProps(id('event_format'), err?.event_format)}>
                <option value="" disabled>—</option>
                {f.eventFormats.map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            </FormField>
            <FormField id={id('venue')} label={f.venue} error={err?.venue}>
              <Input name="venue" defaultValue={defaults?.destination} maxLength={160} {...a11yProps(id('venue'), err?.venue)} />
            </FormField>
            <FormField id={id('headcount')} label={f.headcount} required error={err?.headcount}>
              <Input name="headcount" type="number" min={1} max={5000} required {...a11yProps(id('headcount'), err?.headcount)} />
            </FormField>
            <FormField id={id('needs')} label={f.needs} error={err?.needs} className="sm:col-span-2">
              <Textarea name="needs" maxLength={2000} rows={3} {...a11yProps(id('needs'), err?.needs)} />
            </FormField>
          </div>
        ) : null}

        {variant !== 'transport' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={id('date_from')} label={variant === 'hotel' ? f.checkIn : variant === 'ticketing' ? f.departDate : f.dateFrom} required={variant === 'hotel' || variant === 'ticketing'} error={err?.date_from}>
              <Input name="date_from" type="date" min={minDate} defaultValue={defaults?.date_from} required={variant === 'hotel' || variant === 'ticketing'} {...a11yProps(id('date_from'), err?.date_from)} />
            </FormField>
            {!(variant === 'ticketing' && tripType === 'one_way') ? (
              <FormField id={id('date_to')} label={variant === 'hotel' ? f.checkOut : variant === 'ticketing' ? f.returnDate : f.dateTo} required={variant === 'hotel'} error={err?.date_to}>
                <Input name="date_to" type="date" min={minDate} defaultValue={defaults?.date_to} required={variant === 'hotel'} {...a11yProps(id('date_to'), err?.date_to)} />
              </FormField>
            ) : null}
            <label className="flex items-center gap-3 text-sm text-ink sm:col-span-2">
              <input type="checkbox" name="flexible_dates" className="size-5 rounded border-line accent-brand-500" />
              {f.flexibleDates}
            </label>
          </div>
        ) : null}
      </Fieldset>

      {variant === 'generic' || variant === 'hotel' || variant === 'ticketing' ? (
        <Fieldset legend={f.travellersSection}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={id('adults')} label={f.adults} required error={err?.adults}>
              <Input name="adults" type="number" min={1} max={99} defaultValue={2} required {...a11yProps(id('adults'), err?.adults)} />
            </FormField>
            <FormField id={id('children')} label={f.children} error={err?.children}>
              <Input
                name="children" type="number" min={0} max={20} value={children}
                onChange={(e) => setChildren(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                {...a11yProps(id('children'), err?.children)}
              />
            </FormField>
          </div>
          {childAges.length > 0 ? (
            <div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {childAges.map((i) => (
                  <FormField key={i} id={id(`child_age_${i}`)} label={f.childAge(i + 1)} required>
                    <Select name="children_ages" required defaultValue="" id={id(`child_age_${i}`)} aria-invalid={err?.children_ages ? true : undefined}>
                      <option value="" disabled>—</option>
                      {Array.from({ length: 18 }, (_, a) => <option key={a} value={a}>{a} an{a > 1 ? 's' : ''}</option>)}
                    </Select>
                  </FormField>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">{f.childAgeHint}</p>
              {err?.children_ages ? <p className="mt-1 text-xs font-medium text-danger-700" role="alert">{err.children_ages}</p> : null}
            </div>
          ) : null}
        </Fieldset>
      ) : null}

      <Fieldset legend={f.detailsSection}>
        {variant !== 'mice' && variant !== 'visa' && variant !== 'transport' ? (
          <FormField id={id('budget')} label={f.budget} hint={f.budgetHint} error={err?.budget}>
            <Input name="budget" type="number" min={0} step="1" inputMode="numeric" className="sm:max-w-xs" {...a11yProps(id('budget'), err?.budget, f.budgetHint)} />
          </FormField>
        ) : null}
        <FormField id={id('message')} label={f.message} error={err?.message}>
          <Textarea name="message" rows={4} maxLength={3000} placeholder={f.messagePlaceholder} {...a11yProps(id('message'), err?.message)} />
        </FormField>
      </Fieldset>

      <ConsentFields prefix={idPrefix} errors={err} />

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted sm:max-w-md">{f.noBookingNote}</p>
        <Button type="submit" variant="accent" size="lg" disabled={pending} aria-disabled={pending}>
          {pending ? f.submitting : f.submit}
        </Button>
      </div>
    </form>
  )
}
