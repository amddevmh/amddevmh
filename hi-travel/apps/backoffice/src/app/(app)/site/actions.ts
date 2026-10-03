'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@hi/db/server'
import type { Enums, Json } from '@hi/db'
import { ACTIVITIES } from '@hi/core'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { noticeUrl, parseAmount } from '@/lib/fin/format'

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Adresse : minuscules, chiffres et tirets uniquement')

export async function createOffer(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('site', 'create')
  const parsed = z.object({
    title: z.string().trim().min(3, 'Titre requis'),
    slug: slugSchema,
    activity: z.enum(ACTIVITIES),
    destination: z.string().trim().min(2, 'Destination requise'),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { data, error } = await supabase.from('offers').insert({ ...parsed.data, status: 'draft', owner_id: session.userId }).select('id').single()
  if (error || !data) return fromDbError(error)
  revalidatePath('/site/offres')
  redirect(`/site/offres/${data.id}`)
}

const offerSchema = z.object({
  id: z.guid(),
  title: z.string().trim().min(3, 'Titre requis'),
  slug: slugSchema,
  activity: z.enum(ACTIVITIES),
  is_omra: z.boolean(),
  destination: z.string().trim().min(2, 'Destination requise'),
  country: z.string().trim().optional(),
  duration_days: z.number().int().positive().optional(),
  nights: z.number().int().min(0).optional(),
  summary: z.string().optional(),
  board: z.string().optional(),
  indicative_flights: z.string().optional(),
  conditions: z.string().optional(),
  price_amount: z.number().min(0).optional(),
  price_basis: z.enum(['per_person', 'total', 'from']),
  occupancy_basis: z.string().optional(),
  deposit_amount: z.number().min(0).optional(),
  cta_label: z.string().trim().min(2).default('Demander un devis'),
  featured: z.boolean(),
  sort_order: z.number().int().default(0),
  seo_title: z.string().max(70, 'Titre SEO : 70 caractères maximum').optional(),
  seo_description: z.string().max(170, 'Description SEO : 170 caractères maximum').optional(),
}).refine((v) => v.deposit_amount == null || v.price_amount == null || v.price_basis !== 'total' || v.deposit_amount <= v.price_amount, {
  path: ['deposit_amount'], message: 'L’acompte ne peut dépasser le prix total',
})

const lines = (v: string | undefined) => (v ?? '').split('\n').map((s) => s.trim()).filter(Boolean)

/** Enregistrement du contenu (sans changement de statut). Un changement d'adresse crée une redirection. */
export async function saveOffer(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('site', 'update')
  const raw = formToObject(formData)
  const int = (v?: string) => (v ? Number.parseInt(v, 10) : undefined)
  const parsed = offerSchema.safeParse({
    ...raw,
    is_omra: raw.is_omra === '1', featured: raw.featured === '1',
    duration_days: int(raw.duration_days), nights: int(raw.nights), sort_order: int(raw.sort_order) ?? 0,
    price_amount: parseAmount(raw.price_amount), deposit_amount: parseAmount(raw.deposit_amount),
  })
  if (!parsed.success) return fromZod(parsed)
  let program: NonNullable<Json>, hotels: NonNullable<Json>, photos: NonNullable<Json>
  try {
    program = JSON.parse(String(formData.get('program') ?? '[]'))
    hotels = JSON.parse(String(formData.get('hotels') ?? '[]'))
    photos = JSON.parse(String(formData.get('photos') ?? '[]'))
  } catch {
    return { ok: false, error: 'Programme, hôtels ou photos invalides' }
  }
  if (Array.isArray(photos) && photos.some((p) => !p || typeof p !== 'object' || !('alt' in p) || !String((p as { alt?: string }).alt ?? '').trim())) {
    return { ok: false, error: 'Chaque photo doit avoir un texte alternatif' }
  }
  const supabase = await createClient()
  const { id, ...v } = parsed.data
  const { data: before } = await supabase.from('offers').select('slug, published_by, status').eq('id', id).maybeSingle()
  if (!before) return { ok: false, error: 'Offre introuvable' }
  const { error } = await supabase.from('offers').update({
    ...v,
    activity: v.activity as Enums<'activity'>,
    country: v.country ?? null, duration_days: v.duration_days ?? null, nights: v.nights ?? null, summary: v.summary ?? null,
    board: v.board ?? null, indicative_flights: v.indicative_flights ?? null, conditions: v.conditions ?? null,
    price_amount: v.price_amount ?? null, occupancy_basis: v.occupancy_basis ?? null, deposit_amount: v.deposit_amount ?? null,
    seo_title: v.seo_title ?? null, seo_description: v.seo_description ?? null,
    inclusions: lines(raw.inclusions), exclusions: lines(raw.exclusions), program, hotels, photos,
  }).eq('id', id)
  if (error) return fromDbError(error)
  // Adresse stable : l'ancienne adresse d'une offre déjà publiée redirige vers la nouvelle (SEO)
  if (before.slug !== v.slug && (before.published_by || before.status === 'published' || before.status === 'hidden')) {
    await supabase.from('site_redirects').upsert({ from_path: `/offres/${before.slug}`, to_path: `/offres/${v.slug}`, permanent: true })
  }
  revalidatePath(`/site/offres/${id}`)
  revalidatePath('/site/offres')
  return { ok: true, message: before.slug !== v.slug && before.published_by ? 'Offre enregistrée ; redirection créée depuis l’ancienne adresse.' : 'Offre enregistrée' }
}

/** Workflow Brouillon → À valider → Publié / Masqué / Archivé (publication contrôlée par la base). */
export async function setOfferStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('site', 'update')
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '') as Enums<'publication_status'>
  if (!['draft', 'review', 'published', 'hidden', 'archived'].includes(status)) return { ok: false, error: 'Statut inconnu' }
  if (status === 'published' && !session.can('site', 'validate')) return { ok: false, error: 'Publication réservée à un utilisateur habilité (site : valider)' }
  if (status === 'archived' && !session.can('site', 'archive')) return { ok: false, error: 'Archivage non autorisé' }
  const toIso = (v: FormDataEntryValue | null) => (v && String(v) ? new Date(`${String(v)}:00+01:00`).toISOString() : null)
  const patch: { status: Enums<'publication_status'>; publish_at?: string | null; unpublish_at?: string | null } = { status }
  if (formData.has('publish_at')) patch.publish_at = toIso(formData.get('publish_at'))
  if (formData.has('unpublish_at')) patch.unpublish_at = toIso(formData.get('unpublish_at'))
  if (patch.publish_at && patch.unpublish_at && patch.unpublish_at <= patch.publish_at) return { ok: false, error: 'Le retrait doit suivre la publication' }
  const supabase = await createClient()
  const { error } = await supabase.from('offers').update(patch).eq('id', id)
  if (error) return fromDbError(error)
  revalidatePath(`/site/offres/${id}`)
  revalidatePath('/site/offres')
  redirect(noticeUrl(`/site/offres/${id}`, `offer_${status}`))
}

const departureSchema = z.object({
  id: z.guid().optional(),
  offer_id: z.guid(),
  code: z.string().trim().min(3, 'Code requis'),
  start_date: z.string().min(10, 'Date de début requise'),
  end_date: z.string().min(10, 'Date de fin requise'),
  capacity: z.number().int().min(0),
  price_adult: z.number().min(0).optional(),
  price_child: z.number().min(0).optional(),
  price_infant: z.number().min(0).optional(),
  single_supplement: z.number().min(0).optional(),
  deposit_amount: z.number().min(0).optional(),
  booking_deadline: z.string().optional(),
  option_hold_hours: z.number().int().positive().default(72),
  min_participants: z.number().int().min(0).optional(),
  status: z.enum(['open', 'closed', 'cancelled']),
}).refine((v) => v.end_date >= v.start_date, { path: ['end_date'], message: 'Fin avant le début' })

/** Départ daté : entité distincte du modèle d'offre (capacité contrôlée par la base). */
export async function saveDeparture(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('departures', 'update')
  const raw = formToObject(formData)
  const int = (v?: string) => (v ? Number.parseInt(v, 10) : undefined)
  const parsed = departureSchema.safeParse({
    ...raw, capacity: int(raw.capacity) ?? 0, option_hold_hours: int(raw.option_hold_hours), min_participants: int(raw.min_participants),
    price_adult: parseAmount(raw.price_adult), price_child: parseAmount(raw.price_child), price_infant: parseAmount(raw.price_infant),
    single_supplement: parseAmount(raw.single_supplement), deposit_amount: parseAmount(raw.deposit_amount),
  })
  if (!parsed.success) return fromZod(parsed)
  const { id, ...v } = parsed.data
  const row = {
    ...v, price_adult: v.price_adult ?? null, price_child: v.price_child ?? null, price_infant: v.price_infant ?? null,
    single_supplement: v.single_supplement ?? null, deposit_amount: v.deposit_amount ?? null, booking_deadline: v.booking_deadline ?? null,
    min_participants: v.min_participants ?? null,
  }
  const supabase = await createClient()
  const { error } = id ? await supabase.from('departures').update(row).eq('id', id) : await supabase.from('departures').insert(row)
  if (error) return fromDbError(error, 'Départ refusé (capacité inférieure aux places déjà prises ?)')
  revalidatePath(`/site/offres/${v.offer_id}`)
  return { ok: true, message: id ? 'Départ mis à jour' : 'Départ créé' }
}

/** Chiffrage interne : jamais exposé au site ni au profil « gestion du site ». */
export async function saveCosting(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('margins', 'read')
  const raw = formToObject(formData)
  const offerId = z.guid().safeParse(raw.offer_id)
  if (!offerId.success) return { ok: false, error: 'Offre inconnue' }
  const supabase = await createClient()
  const { error } = await supabase.from('offer_costings').upsert({
    offer_id: offerId.data, estimated_cost: parseAmount(raw.estimated_cost) ?? null, target_margin_pct: parseAmount(raw.target_margin_pct) ?? null,
    notes: raw.notes ?? null, updated_at: new Date().toISOString(),
  })
  if (error) return fromDbError(error)
  revalidatePath(`/site/offres/${offerId.data}`)
  return { ok: true, message: 'Chiffrage interne enregistré' }
}

// ---------------------------------------------------------------------------
// Pages, redirections, coordonnées de l'agence
// ---------------------------------------------------------------------------
export async function savePage(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('site', 'update')
  const raw = formToObject(formData)
  const parsed = z.object({
    id: z.guid().optional(),
    slug: slugSchema,
    title: z.string().trim().min(2, 'Titre requis'),
    body: z.string().default(''),
    seo_title: z.string().max(70).optional(),
    seo_description: z.string().max(170).optional(),
    status: z.enum(['draft', 'review', 'published', 'hidden', 'archived']),
  }).safeParse({ ...raw, body: String(formData.get('body') ?? '') })
  if (!parsed.success) return fromZod(parsed)
  if (parsed.data.status === 'published' && !session.can('site', 'validate')) return { ok: false, error: 'Publication réservée à un utilisateur habilité' }
  const { id, ...v } = parsed.data
  const supabase = await createClient()
  const row = { ...v, seo_title: v.seo_title ?? null, seo_description: v.seo_description ?? null }
  const { error } = id ? await supabase.from('site_pages').update(row).eq('id', id) : await supabase.from('site_pages').insert(row)
  if (error) return fromDbError(error)
  revalidatePath('/site/pages')
  return { ok: true, message: 'Page enregistrée' }
}

const pathSchema = z.string().trim().regex(/^\/[^\s]*$/, 'Chemin commençant par « / »')

export async function addRedirect(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('site', 'update')
  const parsed = z.object({ from_path: pathSchema, to_path: pathSchema, permanent: z.boolean() })
    .refine((v) => v.from_path !== v.to_path, { message: 'Redirection vers elle-même', path: ['to_path'] })
    .safeParse({ from_path: formData.get('from_path'), to_path: formData.get('to_path'), permanent: formData.get('permanent') === '1' })
  if (!parsed.success) return fromZod(parsed)
  const supabase = await createClient()
  const { error } = await supabase.from('site_redirects').upsert(parsed.data)
  if (error) return fromDbError(error)
  revalidatePath('/site/pages')
  return { ok: true, message: 'Redirection enregistrée' }
}

export async function deleteRedirect(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('site', 'update')
  const supabase = await createClient()
  const { error } = await supabase.from('site_redirects').delete().eq('from_path', String(formData.get('from_path') ?? ''))
  if (error) return fromDbError(error)
  revalidatePath('/site/pages')
  return { ok: true, message: 'Redirection supprimée' }
}

export async function saveAgency(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('site', 'update')
  const raw = formToObject(formData)
  const parsed = z.object({
    name: z.string().trim().min(2),
    phone: z.string().trim().min(6, 'Téléphone requis'),
    whatsapp: z.string().trim().regex(/^\+?\d{8,15}$/, 'WhatsApp : numéro international sans espaces').optional(),
    email: z.email('E-mail invalide'),
    address: z.string().trim().optional(),
    hours: z.string().trim().optional(),
    facebook: z.url('Lien invalide').optional(),
    instagram: z.url('Lien invalide').optional(),
    tiktok: z.url('Lien invalide').optional(),
  }).safeParse(raw)
  if (!parsed.success) return fromZod(parsed)
  const { facebook, instagram, tiktok, ...rest } = parsed.data
  const value = { ...rest, socials: Object.fromEntries(Object.entries({ facebook, instagram, tiktok }).filter(([, v]) => v)) }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_app_setting', { p_key: 'agency', p_value: value as Json, p_reason: 'Coordonnées de l’agence (site)' })
  if (error) return fromDbError(error)
  revalidatePath('/site/pages')
  return { ok: true, message: 'Coordonnées de l’agence mises à jour sur le site' }
}
