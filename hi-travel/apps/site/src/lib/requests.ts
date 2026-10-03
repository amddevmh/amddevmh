import 'server-only'
import { z } from 'zod'
import { ACTIVITIES, type Activity } from '@hi/core'
import { formVariantByActivity } from './activities'
import { t } from './i18n'
import { todayTunis } from './forms'

const e = t.form.errors

const optText = (max = 200) =>
  z.string().trim().max(max, e.tooLong).optional().transform((v) => (v ? v : undefined))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, e.date).refine((d) => !Number.isNaN(Date.parse(d)), e.date)
const optDate = z.union([isoDate, z.literal('')]).optional().transform((v) => (v ? v : undefined))

const intIn = (min: number, max: number, msg = e.number) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number({ error: msg }).int(msg).min(min, msg).max(max, msg).optional())

/** Champs communs à toutes les demandes (FO04). */
const base = z.object({
  activity: z.enum(ACTIVITIES),
  category: z.enum(['omra']).optional(),
  submission_token: z.guid(e.token),
  website: z.string().max(0).optional(),            // pot de miel : doit rester vide
  first_name: optText(80),
  last_name: z.string().trim().max(80, e.tooLong).optional().default(''),
  email: z.union([z.email(e.email), z.literal('')]).optional().transform((v) => (v ? v.toLowerCase() : undefined)),
  phone: z.union([z.string().trim().regex(/^\+?[\d\s().-]{8,20}$/, e.phone), z.literal('')]).optional().transform((v) => (v ? v : undefined)),
  offer_id: z.union([z.guid(), z.literal('')]).optional().transform((v) => (v ? v : undefined)),
  departure_id: z.union([z.guid(), z.literal('')]).optional().transform((v) => (v ? v : undefined)),
  destination: optText(200),
  date_from: optDate,
  date_to: optDate,
  flexible_dates: z.literal('on').optional(),
  adults: intIn(0, 99).optional(),
  children: intIn(0, 20).optional(),
  children_ages: z.array(z.coerce.number({ error: e.childAges }).int(e.childAges).min(0, e.childAges).max(17, e.childAges)).default([]),
  budget: z.union([z.coerce.number({ error: e.number }).min(0, e.number).max(10_000_000, e.number), z.literal('')]).optional()
    .transform((v) => (v === '' || v == null ? undefined : v)),
  message: optText(3000),
  processing_consent: z.string().optional(),
  marketing_consent: z.literal('on').optional(),
  // Variantes
  city: optText(120),
  hotel_name: optText(160),
  rooms: intIn(1, 20).optional(),
  board: z.enum(['RO', 'LPD', 'DP', 'PC', 'ALL', '']).optional(),
  visa_country: optText(120),
  visa_type: optText(60),
  applicants: intIn(1, 50).optional(),
  from_city: optText(120),
  to_city: optText(120),
  trip_type: z.enum(['round_trip', 'one_way', 'multi']).optional(),
  cabin: optText(40),
  pickup: optText(200),
  dropoff: optText(200),
  pickup_at: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, e.date), z.literal('')]).optional().transform((v) => (v ? v : undefined)),
  passengers: intIn(1, 200).optional(),
  company: optText(160),
  event_format: optText(60),
  venue: optText(160),
  headcount: intIn(1, 5000).optional(),
  needs: optText(2000),
})

type BaseInput = z.infer<typeof base>

function addIssue(ctx: z.RefinementCtx, path: string, message: string) {
  ctx.addIssue({ code: 'custom', path: [path], message })
}

export const requestSchema = base.superRefine((v, ctx) => {
  const variant = formVariantByActivity[v.activity as Activity]
  if (v.last_name.length < 2) addIssue(ctx, 'last_name', e.lastName)
  if (v.processing_consent !== 'on') addIssue(ctx, 'processing_consent', e.consent)
  if (!v.email && !v.phone) {
    addIssue(ctx, 'email', e.contact)
    addIssue(ctx, 'phone', e.contact)
  }
  const today = todayTunis()
  if (v.date_from && v.date_from < today) addIssue(ctx, 'date_from', e.datePast)
  if (v.date_from && v.date_to && v.date_to < v.date_from) addIssue(ctx, 'date_to', e.dateOrder)
  if (variant === 'generic' || variant === 'hotel' || variant === 'ticketing') {
    if (v.adults == null || v.adults < 1) addIssue(ctx, 'adults', e.adults)
  }
  const children = v.children ?? 0
  if (children > 0 && v.children_ages.length !== children) addIssue(ctx, 'children_ages', e.childAges)
  switch (variant) {
    case 'hotel':
      if (!v.city) addIssue(ctx, 'city', e.required)
      if (!v.date_from) addIssue(ctx, 'date_from', e.required)
      if (!v.date_to) addIssue(ctx, 'date_to', e.required)
      break
    case 'visa':
      if (!v.visa_country) addIssue(ctx, 'visa_country', e.required)
      if (!v.visa_type) addIssue(ctx, 'visa_type', e.required)
      if (v.applicants == null) addIssue(ctx, 'applicants', e.required)
      break
    case 'ticketing':
      if (!v.from_city) addIssue(ctx, 'from_city', e.required)
      if (!v.to_city) addIssue(ctx, 'to_city', e.required)
      if (!v.date_from) addIssue(ctx, 'date_from', e.required)
      if (v.trip_type === 'round_trip' && !v.date_to) addIssue(ctx, 'date_to', e.required)
      break
    case 'transport':
      if (!v.pickup) addIssue(ctx, 'pickup', e.required)
      if (!v.dropoff) addIssue(ctx, 'dropoff', e.required)
      if (!v.pickup_at) addIssue(ctx, 'pickup_at', e.required)
      else if (v.pickup_at.slice(0, 10) < today) addIssue(ctx, 'pickup_at', e.datePast)
      if (v.passengers == null) addIssue(ctx, 'passengers', e.required)
      break
    case 'mice':
      if (!v.company) addIssue(ctx, 'company', e.required)
      if (!v.event_format) addIssue(ctx, 'event_format', e.required)
      if (v.headcount == null) addIssue(ctx, 'headcount', e.required)
      break
  }
})

/** Lecture du FormData : chaînes, sauf les âges des enfants (champ répété). */
export function formDataToRequestInput(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('$ACTION') || typeof v !== 'string') continue
    if (k === 'children_ages') continue
    out[k] = v
  }
  out.children_ages = fd.getAll('children_ages').filter((x): x is string => typeof x === 'string' && x !== '')
  return out
}

/** Construit le paramètre de submit_site_request (jsonb) à partir des données validées. */
export function toSubmitPayload(v: BaseInput, extraDetails: Record<string, unknown> = {}) {
  const variant = formVariantByActivity[v.activity as Activity]
  const details: Record<string, unknown> = { form: variant, ...extraDetails }
  let destination = v.destination
  let adults = v.adults ?? 1
  let children = v.children ?? 0
  let dateFrom = v.date_from
  let dateTo = v.date_to

  switch (variant) {
    case 'hotel':
      destination = [v.hotel_name, v.city].filter(Boolean).join(', ') || destination
      Object.assign(details, { city: v.city, hotel_name: v.hotel_name, rooms: v.rooms ?? 1, board: v.board || null })
      break
    case 'visa':
      destination = v.visa_country
      adults = v.applicants ?? 1
      children = 0
      Object.assign(details, { visa_country: v.visa_country, visa_type: v.visa_type, applicants: v.applicants })
      break
    case 'ticketing':
      destination = `${v.from_city} → ${v.to_city}`
      Object.assign(details, { from_city: v.from_city, to_city: v.to_city, trip_type: v.trip_type ?? 'round_trip', cabin: v.cabin ?? null })
      if (v.trip_type === 'one_way') dateTo = undefined
      break
    case 'transport':
      destination = v.dropoff
      adults = v.passengers ?? 1
      children = 0
      dateFrom = v.pickup_at?.slice(0, 10)
      dateTo = undefined
      Object.assign(details, { pickup: v.pickup, dropoff: v.dropoff, pickup_at: v.pickup_at, passengers: v.passengers })
      break
    case 'mice':
      destination = v.venue ?? destination
      adults = v.headcount ?? 1
      children = 0
      Object.assign(details, { company: v.company, event_format: v.event_format, venue: v.venue, headcount: v.headcount, needs: v.needs })
      break
  }
  if (v.category) details.category = v.category

  return {
    submission_token: v.submission_token,
    activity: v.activity,
    first_name: v.first_name ?? null,
    last_name: v.last_name,
    company: v.company ?? null,
    email: v.email ?? null,
    phone: v.phone ?? null,
    offer_id: v.offer_id ?? null,
    departure_id: v.departure_id ?? null,
    destination: destination ?? null,
    date_from: dateFrom ?? null,
    date_to: dateTo ?? null,
    flexible_dates: v.flexible_dates === 'on',
    adults,
    children,
    children_ages: children > 0 ? v.children_ages.slice(0, children) : [],
    budget: v.budget ?? null,
    message: v.message ?? null,
    details,
    processing_consent: true,
    marketing_consent: v.marketing_consent === 'on',
  }
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!out[key]) out[key] = issue.message
  }
  return out
}
