'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@hi/db/server'
import type { Json } from '@hi/db'
import { classifyRows, normalizeRows, summarize, type DossierCandidate, type ImportTemplate } from '@hi/core'
import { getFxRate } from '@hi/integrations/fx'
import { requireStaff } from '@/lib/auth'
import { fromDbError, type ActionState } from '@/lib/actions'

const MAX_BYTES = 9.5 * 1024 * 1024 // serverActions.bodySizeLimit = 10 Mo (marge pour l'enveloppe multipart)

/**
 * Téléversement d'un rapport (IMP01) → fichier source conservé, lot de prévisualisation (IMP02).
 * Aucune donnée métier n'est modifiée avant l'intégration explicite du lot.
 */
export async function uploadImport(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireStaff('imports', 'create')
  const kind = String(formData.get('kind') ?? '')
  const templateId = String(formData.get('template_id') ?? '')
  const platform = String(formData.get('platform') ?? '').trim()
  const supplierId = String(formData.get('supplier_id') ?? '') || null
  const file = formData.get('file')
  if (kind !== 'ticketing' && kind !== 'hotel_intl') return { ok: false, error: 'Type de rapport inconnu' }
  if (!platform) return { ok: false, error: 'Plateforme d’origine requise', fieldErrors: { platform: ['Requis'] } }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Fichier CSV requis', fieldErrors: { file: ['Fichier requis'] } }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Fichier trop volumineux (9,5 Mo max par lot) : découpez le rapport par période.' }
  if (!/\.csv$/i.test(file.name)) return { ok: false, error: 'Format accepté : CSV (export structuré de la plateforme). Un PDF nécessite une extraction séparée.' }

  const supabase = await createClient()
  const { data: tpl } = await supabase.from('import_templates').select('*').eq('id', templateId).eq('kind', kind).maybeSingle()
  if (!tpl) return { ok: false, error: 'Modèle de correspondance introuvable pour ce type de rapport' }
  const template: ImportTemplate = { kind, version: tpl.version, delimiter: tpl.delimiter, columnMapping: tpl.column_mapping as Record<string, string> }

  const buf = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const text = buf.toString('utf-8')
  const { rows, headerErrors } = normalizeRows(text, template)
  if (headerErrors.length) return { ok: false, error: `Le fichier ne correspond pas au modèle v${tpl.version} :\n${headerErrors.join('\n')}` }
  if (rows.length === 0) return { ok: false, error: 'Aucune ligne de données dans le fichier' }

  // Réimport du même fichier : signalé (les lignes déjà intégrées ressortiront en doublons)
  const { data: previous } = await supabase.from('import_batches').select('id, created_at, status').eq('kind', kind).eq('file_sha256', sha256).neq('status', 'cancelled')

  // Fournisseur : choisi pour tout le lot, ou retrouvé par son nom (hôtels étrangers)
  const { data: suppliers } = await supabase.from('suppliers').select('id, name')
  for (const r of rows) {
    const byName = typeof r.normalized.supplier === 'string'
      ? suppliers?.find((s) => s.name.toLowerCase() === String(r.normalized.supplier).toLowerCase())?.id
      : undefined
    r.normalized.supplier_id = byName ?? supplierId
  }

  // Devise étrangère : taux daté proposé (estimation, conservée avec sa source sur la prestation)
  const currencies = [...new Set(rows.map((r) => r.normalized.currency).filter((c): c is string => typeof c === 'string' && c !== 'TND'))]
  const rates = new Map<string, number>()
  for (const cur of currencies) {
    const { data: fx } = await supabase.from('fx_rates').select('rate_to_tnd').eq('currency', cur).order('rate_date', { ascending: false }).limit(1).maybeSingle()
    if (fx) rates.set(cur, Number(fx.rate_to_tnd))
    else {
      try { rates.set(cur, (await getFxRate(cur)).rateToTnd) } catch { /* devise non prise en charge : taux à compléter */ }
    }
  }
  for (const r of rows) {
    const cur = r.normalized.currency
    if (typeof cur === 'string' && cur !== 'TND') {
      if (rates.has(cur)) r.normalized.fx_rate = rates.get(cur)!
      else r.errors.push({ field: 'currency', message: `Taux de change indisponible pour ${cur} : à compléter` })
    }
  }

  // Enregistrements externes déjà connus (plateforme + nature) et dossiers candidats
  const { data: ext } = await supabase.from('external_records').select('external_key, last_data, service_id, services(dossier_id)').eq('platform', platform).eq('kind', kind)
  const existing = new Map((ext ?? []).map((e) => [e.external_key, e.last_data as Record<string, unknown>]))
  const dossierOfKey = new Map((ext ?? []).map((e) => [e.external_key, e.services?.dossier_id ?? null]))
  const { data: dossiers } = await supabase.from('dossiers').select('id, reference, start_date, dossier_travellers(travellers(first_name, last_name))').neq('status', 'archived').limit(5000)
  const candidates: DossierCandidate[] = (dossiers ?? []).map((d) => ({
    id: d.id, reference: d.reference, startDate: d.start_date,
    travellerNames: d.dossier_travellers.flatMap((t) => t.travellers ? [`${t.travellers.first_name} ${t.travellers.last_name}`, `${t.travellers.last_name}/${t.travellers.first_name}`, t.travellers.last_name] : []),
  }))
  const classified = classifyRows(rows, existing, candidates).map((r) => {
    const known = r.externalKey ? dossierOfKey.get(r.externalKey) : null
    return known && (r.classification === 'modified' || r.classification === 'duplicate') ? { ...r, targetDossierId: known } : r
  })
  const stats = summarize(classified)

  // Fichier source conservé (bucket privé) avec sa provenance
  const path = `imports/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: upErr } = await supabase.storage.from('documents').upload(path, buf, { contentType: 'text/csv', upsert: false })
  if (upErr) return { ok: false, error: `Dépôt du fichier impossible : ${upErr.message}` }
  const { data: doc, error: docErr } = await supabase.from('documents').insert({
    kind: 'import_source', title: `Import ${kind === 'ticketing' ? 'billetterie' : 'hôtels étrangers'} — ${file.name}`, storage_path: path,
    mime_type: 'text/csv', size_bytes: file.size, uploaded_via: 'import', supplier_id: supplierId,
  }).select('id').single()
  if (docErr || !doc) return fromDbError(docErr)

  const { data: batch, error: bErr } = await supabase.from('import_batches').insert({
    kind, template_id: tpl.id, source_document_id: doc.id, file_name: file.name, file_sha256: sha256, platform,
    stats: { ...stats, rows: classified.length, template_version: tpl.version, same_file_batches: (previous ?? []).map((p) => p.id), uploaded_by: session.profile.full_name } as NonNullable<Json>,
  }).select('id').single()
  if (bErr || !batch) return fromDbError(bErr)

  const { error: rErr } = await supabase.from('import_rows').insert(classified.map((r) => ({
    batch_id: batch.id, row_number: r.rowNumber, external_key: r.externalKey, classification: r.classification,
    errors: r.errors as unknown as NonNullable<Json>, diff: (r.diff ?? null) as Json, raw: r.raw as NonNullable<Json>, normalized: r.normalized as NonNullable<Json>,
    candidate_dossier_ids: r.candidateDossierIds, target_dossier_id: r.targetDossierId,
    decision: r.classification === 'new' || r.classification === 'modified' ? 'apply' : r.classification === 'ambiguous' ? 'pending' : 'skip',
  })))
  if (rErr) return fromDbError(rErr)
  revalidatePath('/integrations/imports')
  redirect(`/integrations/imports/${batch.id}`)
}

/** Décisions ligne à ligne : dossier cible des lignes ambiguës, intégrer ou ignorer. */
export async function saveDecisions(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('imports', 'create')
  const batchId = String(formData.get('batch_id') ?? '')
  const supabase = await createClient()
  const { data: batch } = await supabase.from('import_batches').select('status').eq('id', batchId).maybeSingle()
  if (batch?.status !== 'preview') return { ok: false, error: 'Lot déjà intégré ou annulé' }
  const { data: rows } = await supabase.from('import_rows').select('id, classification, decision, target_dossier_id').eq('batch_id', batchId)
  let changed = 0
  const problems: string[] = []
  for (const r of rows ?? []) {
    const decision = formData.get(`decision_${r.id}`)
    const target = formData.get(`target_${r.id}`)
    if (decision == null && target == null) continue
    const nextDecision = (decision ? String(decision) : r.decision) as 'pending' | 'apply' | 'skip'
    const nextTarget = target != null ? (String(target) || null) : r.target_dossier_id
    if (nextDecision === 'apply' && (r.classification === 'invalid' || r.classification === 'duplicate')) {
      problems.push(`Ligne ${r.id.slice(0, 8)} : ${r.classification === 'invalid' ? 'invalide, à corriger dans le fichier' : 'doublon'}`)
      continue
    }
    if (nextDecision === 'apply' && !nextTarget) {
      problems.push('Une ligne à intégrer doit avoir un dossier cible')
      continue
    }
    if (nextDecision !== r.decision || nextTarget !== r.target_dossier_id) {
      const { error } = await supabase.from('import_rows').update({ decision: nextDecision, target_dossier_id: nextTarget }).eq('id', r.id)
      if (error) return fromDbError(error)
      changed++
    }
  }
  revalidatePath(`/integrations/imports/${batchId}`)
  if (problems.length) return { ok: false, error: `${changed} décision(s) enregistrée(s). À revoir :\n${[...new Set(problems)].join('\n')}` }
  return { ok: true, message: `${changed} décision(s) enregistrée(s)` }
}

export async function commitBatch(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('imports', 'validate')
  const batchId = String(formData.get('batch_id') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('commit_import_batch', { p_batch_id: batchId })
  if (error) return fromDbError(error)
  const s = (data ?? {}) as { created?: number; updated?: number; skipped?: number }
  revalidatePath(`/integrations/imports/${batchId}`)
  revalidatePath('/integrations/imports')
  return { ok: true, message: `Lot intégré : ${s.created ?? 0} créée(s), ${s.updated ?? 0} mise(s) à jour, ${s.skipped ?? 0} non intégrée(s).` }
}

export async function cancelBatch(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff('imports', 'create')
  const batchId = String(formData.get('batch_id') ?? '')
  const supabase = await createClient()
  const { error, count } = await supabase.from('import_batches').update({ status: 'cancelled' }, { count: 'exact' }).eq('id', batchId).eq('status', 'preview')
  if (error) return fromDbError(error)
  if (!count) return { ok: false, error: 'Seul un lot en prévisualisation peut être abandonné (un lot intégré ne s’annule pas silencieusement).' }
  revalidatePath('/integrations/imports')
  revalidatePath(`/integrations/imports/${batchId}`)
  return { ok: true, message: 'Lot abandonné : aucune donnée intégrée. Le fichier source reste conservé.' }
}
