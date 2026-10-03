'use server'

import { z } from 'zod'
import { requireStaff } from '@/lib/auth'
import { fromDbError, fromZod, formToObject, type ActionState } from '@/lib/actions'
import { db } from '@/lib/ops/data'
import { zonedLocalToIso } from '@/lib/ops/format'
import { fail, ok } from '@/lib/ops/server'

/** Pose d’une option ou de places confirmées : hold_departure_seats verrouille le départ (pas de survente). */
export async function placeHold(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('departures', 'update')
  const parsed = z.object({
    departure_id: z.guid(),
    seats: z.coerce.number().int().min(1, 'Au moins une place'),
    kind: z.enum(['option', 'confirmed']),
    dossier_id: z.guid().optional(),
    lead_id: z.guid().optional(),
    expires_at: z.string().optional(),
  }).safeParse(formToObject(formData))
  if (!parsed.success) return fromZod(parsed)
  const v = parsed.data
  if (!v.dossier_id && !v.lead_id) return { ok: false, error: 'Rattacher la réservation à un dossier ou à une demande', fieldErrors: { dossier_id: ['Dossier ou demande requis'] } }
  const supabase = await db()
  const { error } = await supabase.rpc('hold_departure_seats', {
    p_departure_id: v.departure_id, p_seats: v.seats, p_kind: v.kind, p_dossier_id: v.dossier_id, p_lead_id: v.lead_id,
    p_expires_at: v.kind === 'option' ? (zonedLocalToIso(v.expires_at) ?? undefined) : undefined,
  })
  if (error) return fromDbError(error)
  return ok(v.kind === 'option' ? `Option posée sur ${v.seats} place(s)` : `${v.seats} place(s) confirmée(s)`)
}

export async function releaseHold(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('departures', 'update')
  const id = z.guid().safeParse(formData.get('hold_id'))
  if (!id.success) return fail('Réservation inconnue')
  const supabase = await db()
  const { error } = await supabase.rpc('release_departure_hold', { p_hold_id: id.data, p_new_status: 'released' })
  if (error) return fromDbError(error)
  return ok('Places libérées')
}

export async function confirmHold(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('departures', 'update')
  const id = z.guid().safeParse(formData.get('hold_id'))
  if (!id.success) return fail('Option inconnue')
  const supabase = await db()
  const { error } = await supabase.rpc('confirm_departure_hold', { p_hold_id: id.data })
  if (error) return fromDbError(error)
  return ok('Option convertie en places confirmées')
}

export async function expireOptionsNow(): Promise<ActionState> {
  await requireStaff('departures', 'update')
  const supabase = await db()
  const { data, error } = await supabase.rpc('expire_departure_options')
  if (error) return fromDbError(error)
  return ok(data ? `${data} option(s) expirée(s) et places libérées` : 'Aucune option échue')
}
