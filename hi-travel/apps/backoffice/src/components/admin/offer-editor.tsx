'use client'

import { useState } from 'react'
import { ACTIVITIES, activityLabels, boardLabels, priceLabel, formatMoney } from '@hi/core'
import { createClient } from '@hi/db/browser'
import { Alert, Button, Field, Input, Select, Textarea } from '@hi/ui'
import { FormMessage } from '@/components/forms'
import { PendingButton, useStickyAction } from '@/components/fin/sticky-form'
import type { ActionState } from '@/lib/actions'
import { parseAmount } from '@/lib/fin/format'

interface Day { day: number; title: string; description: string }
interface Hotel { name: string; city: string; nights?: number | string; board?: string }
interface Photo { url: string; alt: string }

export interface OfferData {
  id: string; title: string; slug: string; activity: string; is_omra: boolean; destination: string; country: string | null
  duration_days: number | null; nights: number | null; summary: string | null; program: Day[]; hotels: Hotel[]; board: string | null
  indicative_flights: string | null; inclusions: string[]; exclusions: string[]; conditions: string | null; photos: Photo[]
  price_amount: number | null; price_basis: 'per_person' | 'total' | 'from'; occupancy_basis: string | null; deposit_amount: number | null
  cta_label: string; featured: boolean; sort_order: number; seo_title: string | null; seo_description: string | null
}

export function OfferEditor({ action, offer, slugLocked }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; offer: OfferData; slugLocked: boolean }) {
  const { state, onSubmit, pending } = useStickyAction(action)
  const [program, setProgram] = useState<Day[]>(offer.program ?? [])
  const [hotels, setHotels] = useState<Hotel[]>(offer.hotels ?? [])
  const [photos, setPhotos] = useState<Photo[]>(offer.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [basis, setBasis] = useState(offer.price_basis)
  const [price, setPrice] = useState(offer.price_amount != null ? String(offer.price_amount) : '')
  const [deposit, setDeposit] = useState(offer.deposit_amount != null ? String(offer.deposit_amount) : '')
  const [seoTitle, setSeoTitle] = useState(offer.seo_title ?? '')
  const [seoDesc, setSeoDesc] = useState(offer.seo_description ?? '')
  const fe = (k: string) => state.fieldErrors?.[k]?.[0]

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true); setUploadError(null)
    const supabase = createClient()
    for (const f of Array.from(files)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { setUploadError('Formats acceptés : JPEG, PNG, WebP'); continue }
      if (f.size > 5 * 1024 * 1024) { setUploadError('Image trop lourde (5 Mo maximum) : optimisez-la avant dépôt'); continue }
      const path = `offers/${offer.id}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('site-media').upload(path, f, { contentType: f.type, upsert: false })
      if (error) { setUploadError(`Dépôt impossible : ${error.message}`); continue }
      const { data } = supabase.storage.from('site-media').getPublicUrl(path)
      setPhotos((p) => [...p, { url: data.publicUrl, alt: '' }])
    }
    setUploading(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="id" value={offer.id} />
      <input type="hidden" name="program" value={JSON.stringify(program)} />
      <input type="hidden" name="hotels" value={JSON.stringify(hotels.map((h) => ({ ...h, nights: h.nights ? Number(h.nights) : undefined })))} />
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />

      <section className="grid gap-4 md:grid-cols-4">
        <Field label="Titre" htmlFor="title" required error={fe('title')} className="md:col-span-2"><Input id="title" name="title" defaultValue={offer.title} /></Field>
        <Field label="Adresse (slug)" htmlFor="slug" required error={fe('slug')} hint={slugLocked ? 'Offre déjà publiée : un changement crée une redirection depuis l’ancienne adresse' : 'Adresse stable de la fiche'}>
          <Input id="slug" name="slug" defaultValue={offer.slug} className="font-mono" />
        </Field>
        <Field label="Activité" htmlFor="activity">
          <Select id="activity" name="activity" defaultValue={offer.activity}>{ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}</Select>
        </Field>
        <Field label="Destination" htmlFor="destination" required error={fe('destination')}><Input id="destination" name="destination" defaultValue={offer.destination} /></Field>
        <Field label="Pays (code)" htmlFor="country"><Input id="country" name="country" defaultValue={offer.country ?? ''} maxLength={2} /></Field>
        <Field label="Durée (jours)" htmlFor="duration_days"><Input id="duration_days" name="duration_days" type="number" min={1} defaultValue={offer.duration_days ?? ''} /></Field>
        <Field label="Nuitées" htmlFor="nights" hint="Distinctes de la durée du voyage"><Input id="nights" name="nights" type="number" min={0} defaultValue={offer.nights ?? ''} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_omra" value="1" defaultChecked={offer.is_omra} /> Programme Omra (catégorie dédiée)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" value="1" defaultChecked={offer.featured} /> Mise en avant sur l’accueil</label>
        <Field label="Ordre d’affichage" htmlFor="sort_order"><Input id="sort_order" name="sort_order" type="number" defaultValue={offer.sort_order} /></Field>
        <Field label="Libellé du bouton (CTA)" htmlFor="cta_label"><Input id="cta_label" name="cta_label" defaultValue={offer.cta_label} /></Field>
        <Field label="Résumé" htmlFor="summary" className="md:col-span-4"><Textarea id="summary" name="summary" rows={3} defaultValue={offer.summary ?? ''} /></Field>
      </section>

      <section className="rounded-card border border-line p-4">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-brand-900">Programme jour par jour</h3>
          <Button type="button" size="sm" variant="secondary" onClick={() => setProgram((p) => [...p, { day: (p[p.length - 1]?.day ?? 0) + 1, title: '', description: '' }])}>+ Jour</Button>
        </div>
        {program.length === 0 ? <p className="text-sm text-muted">Aucune étape.</p> : null}
        <div className="space-y-3">
          {program.map((d, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[80px_1fr_2fr_auto]">
              <Input aria-label="Jour" type="number" min={1} value={d.day} onChange={(e) => setProgram((p) => p.map((x, j) => (j === i ? { ...x, day: Number(e.target.value) } : x)))} />
              <Input aria-label="Titre du jour" placeholder="Titre" value={d.title} onChange={(e) => setProgram((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Textarea aria-label="Description du jour" rows={2} className="min-h-10" placeholder="Description" value={d.description} onChange={(e) => setProgram((p) => p.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <button type="button" className="text-danger-700" aria-label="Retirer le jour" onClick={() => setProgram((p) => p.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-card border border-line p-4 md:grid-cols-2">
        <div className="md:col-span-2 flex items-center justify-between"><h3 className="font-semibold text-brand-900">Hébergement et transport</h3>
          <Button type="button" size="sm" variant="secondary" onClick={() => setHotels((h) => [...h, { name: '', city: '', nights: '', board: offer.board ?? '' }])}>+ Hôtel</Button>
        </div>
        <div className="space-y-2 md:col-span-2">
          {hotels.map((h, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[2fr_1fr_100px_160px_auto]">
              <Input aria-label="Hôtel" placeholder="Hôtel" value={h.name} onChange={(e) => setHotels((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
              <Input aria-label="Ville" placeholder="Ville" value={h.city} onChange={(e) => setHotels((x) => x.map((y, j) => (j === i ? { ...y, city: e.target.value } : y)))} />
              <Input aria-label="Nuits" placeholder="Nuits" type="number" value={h.nights ?? ''} onChange={(e) => setHotels((x) => x.map((y, j) => (j === i ? { ...y, nights: e.target.value } : y)))} />
              <Select aria-label="Pension" value={h.board ?? ''} onChange={(e) => setHotels((x) => x.map((y, j) => (j === i ? { ...y, board: e.target.value } : y)))}>
                <option value="">Pension</option>{Object.entries(boardLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <button type="button" className="text-danger-700" aria-label="Retirer l’hôtel" onClick={() => setHotels((x) => x.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <Field label="Pension principale" htmlFor="board">
          <Select id="board" name="board" defaultValue={offer.board ?? ''}><option value="">—</option>{Object.entries(boardLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Vols indicatifs" htmlFor="indicative_flights"><Input id="indicative_flights" name="indicative_flights" defaultValue={offer.indicative_flights ?? ''} /></Field>
        <Field label="Inclus (une ligne par élément)" htmlFor="inclusions"><Textarea id="inclusions" name="inclusions" rows={5} defaultValue={(offer.inclusions ?? []).join('\n')} /></Field>
        <Field label="Non inclus (une ligne par élément)" htmlFor="exclusions"><Textarea id="exclusions" name="exclusions" rows={5} defaultValue={(offer.exclusions ?? []).join('\n')} /></Field>
        <Field label="Conditions" htmlFor="conditions" className="md:col-span-2"><Textarea id="conditions" name="conditions" rows={3} defaultValue={offer.conditions ?? ''} /></Field>
      </section>

      <section className="grid gap-4 rounded-card border border-line p-4 md:grid-cols-4">
        <h3 className="font-semibold text-brand-900 md:col-span-4">Prix affiché (FO02)</h3>
        <Field label="Montant (TND)" htmlFor="price_amount" error={fe('price_amount')} hint="Obligatoire pour publier"><Input id="price_amount" name="price_amount" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="text-right" /></Field>
        <Field label="Base du prix" htmlFor="price_basis">
          <Select id="price_basis" name="price_basis" value={basis} onChange={(e) => setBasis(e.target.value as OfferData['price_basis'])}>
            <option value="per_person">Prix par personne</option><option value="total">Prix total</option><option value="from">À partir de</option>
          </Select>
        </Field>
        <Field label="Base d’occupation" htmlFor="occupancy_basis" hint="Ex. base chambre double"><Input id="occupancy_basis" name="occupancy_basis" defaultValue={offer.occupancy_basis ?? ''} /></Field>
        <Field label="Acompte à la réservation (TND)" htmlFor="deposit_amount" error={fe('deposit_amount')} hint="Distinct du prix : jamais présenté comme prix total"><Input id="deposit_amount" name="deposit_amount" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="text-right" /></Field>
        <div className="md:col-span-4 rounded-lg bg-canvas px-4 py-3 text-sm">
          <span className="text-xs uppercase text-muted">Aperçu public : </span>
          {parseAmount(price) ? <strong>{priceLabel(basis)} {formatMoney(parseAmount(price))}</strong> : <em className="text-muted">prix non renseigné</em>}
          {parseAmount(deposit) ? <span className="ml-3 text-muted">· Acompte à la réservation : {formatMoney(parseAmount(deposit))}</span> : null}
        </div>
      </section>

      <section className="rounded-card border border-line p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-brand-900">Photos (bucket public, sans données personnelles)</h3>
          <label className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50">
            {uploading ? 'Dépôt…' : '+ Ajouter des photos'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        {uploadError ? <Alert tone="danger" className="mb-2">{uploadError}</Alert> : null}
        {photos.length === 0 ? <p className="text-sm text-muted">Aucune photo.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {photos.map((p, i) => (
              <div key={p.url} className="rounded-lg border border-line p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.alt || 'aperçu'} className="mb-2 aspect-video w-full rounded object-cover" />
                <Input aria-label="Texte alternatif" placeholder="Texte alternatif (obligatoire)" value={p.alt} onChange={(e) => setPhotos((x) => x.map((y, j) => (j === i ? { ...y, alt: e.target.value } : y)))} aria-invalid={!p.alt.trim()} />
                <div className="mt-1 flex justify-between text-xs">
                  <button type="button" className="text-brand-600" disabled={i === 0} onClick={() => setPhotos((x) => { const c = [...x]; [c[i - 1], c[i]] = [c[i]!, c[i - 1]!]; return c })}>← Avant</button>
                  <button type="button" className="text-danger-700" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))}>Retirer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-card border border-line p-4 md:grid-cols-2">
        <h3 className="font-semibold text-brand-900 md:col-span-2">Référencement</h3>
        <Field label={`Titre SEO (${seoTitle.length}/70)`} htmlFor="seo_title" error={fe('seo_title')}><Input id="seo_title" name="seo_title" value={seoTitle} maxLength={70} onChange={(e) => setSeoTitle(e.target.value)} /></Field>
        <Field label={`Description SEO (${seoDesc.length}/170)`} htmlFor="seo_description" error={fe('seo_description')}><Textarea id="seo_description" name="seo_description" rows={2} value={seoDesc} maxLength={170} onChange={(e) => setSeoDesc(e.target.value)} /></Field>
      </section>

      <FormMessage state={state} />
      <div className="sticky bottom-0 flex justify-end border-t border-line bg-white/90 py-3 backdrop-blur">
        <PendingButton pending={pending}>Enregistrer le contenu</PendingButton>
      </div>
    </form>
  )
}
