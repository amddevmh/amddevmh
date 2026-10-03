'use server'

import type { Json } from '@hi/db'
import { createPublicClient } from '@/lib/supabase'
import { formDataToRequestInput, requestSchema, toSubmitPayload, zodFieldErrors } from '@/lib/requests'
import type { RequestFormState } from '@/lib/forms'
import { t } from '@/lib/i18n'

/**
 * Demande depuis un formulaire du site (FO04, REC48).
 * Validation serveur (zod), pot de miel, puis submit_site_request avec le client anonyme :
 * la fonction SQL est idempotente par submission_token (double clic sans doublon).
 */
export async function submitRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const raw = formDataToRequestInput(formData)

  // Pot de miel rempli : réponse neutre, rien n'est enregistré
  if (typeof raw.website === 'string' && raw.website.trim() !== '') {
    return { status: 'success', reference: undefined }
  }

  const parsed = requestSchema.safeParse(raw)
  if (!parsed.success) {
    return { status: 'error', error: t.form.errors.generic, fieldErrors: zodFieldErrors(parsed.error) }
  }

  const payload = toSubmitPayload(parsed.data)
  const { data, error } = await createPublicClient().rpc('submit_site_request', { p: payload as unknown as Json })
  if (error) {
    // Les messages métier de la fonction SQL sont en français et sans donnée sensible
    const known = error.code === 'P0001' && error.message && error.message.length < 200
    return { status: 'error', error: known ? error.message : t.form.errors.server }
  }
  const result = data as { reference: string; duplicate_submission: boolean }
  return { status: 'success', reference: result.reference, duplicate: result.duplicate_submission }
}
