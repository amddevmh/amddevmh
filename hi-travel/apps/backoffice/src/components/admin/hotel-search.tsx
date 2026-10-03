'use client'

import { useState, useTransition } from 'react'
import { boardLabels, formatDateTimeFr, formatMoney } from '@hi/core'
import type { NormalizedHotelOffer } from '@hi/integrations/hotels'
import { Alert, Badge, Button, Card, Field, Input, Select, cn } from '@hi/ui'
import { bookHotel, recheckOffer, retryBooking, searchHotels, verifyBooking, type ProviderResult, type SearchInput } from '@/app/(app)/integrations/hotels/actions'

const STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  success: { label: 'Disponible', tone: 'success' },
  unavailable: { label: 'Indisponible', tone: 'danger' },
  timeout: { label: 'Délai dépassé', tone: 'warning' },
  error: { label: 'Erreur', tone: 'danger' },
  disabled: { label: 'Désactivé', tone: 'neutral' },
  not_mapped: { label: 'Non référencé', tone: 'neutral' },
}

export interface ExistingBooking { id: string; status: string; connector: string; external_ref: string | null; last_error: string | null; attempts: number }

export function HotelSearch({ hotels, cities, defaults, serviceId, existing, manualHref }: {
  hotels: Array<{ id: string; name: string; city: string }>
  cities: string[]
  defaults: { city?: string; hotelId?: string; checkIn: string; checkOut: string; adults: number; children: number }
  /** Mode réservation pour une prestation du dossier */
  serviceId?: string
  existing?: ExistingBooking | null
  manualHref?: string
}) {
  const [form, setForm] = useState({ ...defaults, city: defaults.city ?? '', hotelId: defaults.hotelId ?? '' })
  const [results, setResults] = useState<ProviderResult[] | null>(null)
  const [searchedAt, setSearchedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Réservation
  const [selected, setSelected] = useState<{ code: string; label: string; offer: NormalizedHotelOffer } | null>(null)
  const [recheck, setRecheck] = useState<{ available?: boolean; price?: number | null; changed?: boolean; error?: string } | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [booking, setBooking] = useState<{ ok: boolean; status?: string; message: string; requestRowId?: string; canRetry?: boolean } | null>(
    existing ? { ok: existing.status === 'confirmed' || existing.status === 'pending', status: existing.status, requestRowId: existing.id, message: `Demande existante (${existing.connector}) : statut ${existing.status}${existing.external_ref ? `, référence ${existing.external_ref}` : ''}${existing.last_error ? ` — ${existing.last_error}` : ''}` } : null,
  )

  const input = (): SearchInput => ({
    city: form.hotelId ? undefined : form.city || undefined, hotelId: form.hotelId || undefined,
    checkIn: form.checkIn, checkOut: form.checkOut, adults: Number(form.adults), children: Number(form.children),
  })
  const run = () => start(async () => {
    setError(null); setSelected(null); setRecheck(null)
    const r = await searchHotels(input())
    if (r.error) { setError(r.error); setResults(null) } else { setResults(r.results ?? []); setSearchedAt(r.searchedAt ?? null) }
  })
  const choose = (code: string, label: string, offer: NormalizedHotelOffer) => start(async () => {
    setSelected({ code, label, offer }); setAccepted(false); setRecheck(null)
    setRequestId(crypto.randomUUID())
    setRecheck(await recheckOffer(code, offer.offerRef, input()))
  })
  const book = () => start(async () => {
    if (!selected || !requestId || !serviceId) return
    const price = recheck?.price ?? selected.offer.price.amount
    setBooking(await bookHotel({ serviceId, connector: selected.code, requestId, offer: recheck?.changed && recheck.price ? { ...selected.offer, price: { ...selected.offer.price, amount: recheck.price } } : selected.offer, acceptedPrice: price, priceChanged: !!recheck?.changed, priceChangeAccepted: accepted }))
  })
  const verify = () => start(async () => { if (booking?.requestRowId) setBooking(await verifyBooking(booking.requestRowId)) })
  const retry = () => start(async () => { if (booking?.requestRowId) setBooking(await retryBooking(booking.requestRowId)) })

  const blocked = !!booking && ['sent', 'pending', 'confirmed', 'to_verify'].includes(booking.status ?? '')
  const allOff = results?.every((r) => r.status === 'disabled' || !r.capabilities?.book)

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); run() }} className="grid gap-3 md:grid-cols-6">
          <Field label="Hôtel (correspondance)" htmlFor="hs-hotel" className="md:col-span-2">
            <Select id="hs-hotel" value={form.hotelId} onChange={(e) => setForm({ ...form, hotelId: e.target.value })}>
              <option value="">— Toute la ville —</option>
              {hotels.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.city})</option>)}
            </Select>
          </Field>
          <Field label="Ville" htmlFor="hs-city">
            <Select id="hs-city" value={form.city} disabled={!!form.hotelId} onChange={(e) => setForm({ ...form, city: e.target.value })}>
              <option value="">—</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Arrivée" htmlFor="hs-in"><Input id="hs-in" type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></Field>
          <Field label="Départ" htmlFor="hs-out"><Input id="hs-out" type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Adultes" htmlFor="hs-ad"><Input id="hs-ad" type="number" min={1} value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} /></Field>
            <Field label="Enfants" htmlFor="hs-ch"><Input id="hs-ch" type="number" min={0} value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} /></Field>
          </div>
          <div className="md:col-span-6 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Chaque fournisseur est interrogé indépendamment : la panne de l’un ne bloque pas l’autre. Les offres ne sont jamais fusionnées.</p>
            <Button type="submit" disabled={pending}>{pending && !selected ? 'Recherche…' : 'Rechercher'}</Button>
          </div>
        </form>
      </Card>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {booking ? (
        <Alert tone={booking.ok ? 'success' : booking.status === 'to_verify' ? 'warning' : booking.status === 'failed' ? 'danger' : 'info'} title={booking.status === 'to_verify' ? 'Réservation à vérifier' : 'Suivi de la réservation'}>
          <p>{booking.message}</p>
          {booking.requestRowId && ['to_verify', 'sent', 'pending'].includes(booking.status ?? '') ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={verify} disabled={pending}>Vérifier le statut</Button>
              {booking.canRetry ? <Button type="button" size="sm" variant="secondary" onClick={retry} disabled={pending}>Reprendre avec le même identifiant</Button> : null}
            </div>
          ) : null}
        </Alert>
      ) : null}

      {serviceId && allOff ? (
        <Alert tone="warning" title="Parcours manuel">
          Aucun connecteur actif ne permet la réservation : réservez auprès du fournisseur puis saisissez la confirmation sur la prestation{manualHref ? <> (<a className="underline" href={manualHref}>ouvrir le dossier</a>)</> : null}.
        </Alert>
      ) : null}

      {selected && serviceId ? (
        <Card className="border-brand-300 p-4">
          <p className="text-sm font-semibold text-brand-900">Offre choisie — {selected.label}</p>
          <p className="mt-1 text-sm">{selected.offer.providerHotelName} · {selected.offer.roomType} · {selected.offer.boardLabelOriginal} · {selected.offer.nights} nuit(s)</p>
          <p className="text-sm">Prix consulté : <strong className="tabular">{formatMoney(selected.offer.price.amount, selected.offer.price.currency)}</strong> le {formatDateTimeFr(selected.offer.fetchedAt)}</p>
          {!recheck ? <p className="mt-2 text-sm text-muted">Revérification du prix et de la disponibilité…</p> : recheck.error ? (
            <Alert tone="warning" className="mt-2">{recheck.error}</Alert>
          ) : (
            <div className="mt-2 space-y-2 text-sm">
              {!recheck.available ? <Alert tone="danger">Offre plus disponible chez le fournisseur.</Alert> : null}
              {recheck.changed ? (
                <Alert tone="warning" title="Prix modifié par le fournisseur">
                  Nouveau prix : <strong className="tabular">{formatMoney(recheck.price, selected.offer.price.currency)}</strong> (au lieu de {formatMoney(selected.offer.price.amount, selected.offer.price.currency)}).
                  <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> J’accepte explicitement le nouveau prix</label>
                </Alert>
              ) : recheck.available ? <Badge tone="success">Prix et disponibilité confirmés à l’instant</Badge> : null}
              <p className="text-xs text-muted">Identifiant unique de demande : <span className="font-mono">{requestId}</span> — réutilisé en cas de nouvelle soumission.</p>
              <Button type="button" onClick={book} disabled={pending || blocked || !recheck.available || (recheck.changed && !accepted)}>
                {pending ? 'Envoi…' : 'Réserver auprès du fournisseur'}
              </Button>
              {blocked ? <p className="text-xs text-warning-600">Une demande existe déjà pour cette prestation : vérifiez son statut avant toute nouvelle tentative.</p> : null}
            </div>
          )}
        </Card>
      ) : null}

      {results ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {results.map((r) => {
            const st = STATUS[r.status] ?? STATUS.error!
            const byHotel = new Map<string, NormalizedHotelOffer[]>()
            for (const o of r.offers) byHotel.set(o.providerHotelName, [...(byHotel.get(o.providerHotelName) ?? []), o])
            return (
              <Card key={r.code} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas px-4 py-3">
                  <div>
                    <p className="font-semibold text-brand-900">{r.label}</p>
                    <p className="font-mono text-xs text-muted">{r.code}{r.durationMs != null ? ` · ${r.durationMs} ms` : ''}{searchedAt ? ` · consulté le ${formatDateTimeFr(searchedAt)}` : ''}</p>
                  </div>
                  <Badge tone={st.tone}>{r.status === 'success' ? `${r.offers.length} offre(s)` : st.label}</Badge>
                </div>
                {r.status !== 'success' ? <p className="px-4 py-6 text-sm text-muted">{r.message ?? st.label}{r.status === 'unavailable' || r.status === 'timeout' ? ' — l’autre fournisseur reste utilisable.' : ''}</p> : r.offers.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted">Aucune offre pour ces critères.</p>
                ) : (
                  <div className="divide-y divide-line">
                    {[...byHotel.entries()].map(([hotel, offers]) => (
                      <div key={hotel} className="px-4 py-3">
                        <p className="mb-2 text-sm font-semibold text-brand-900">{hotel} <span className="font-normal text-muted">· {offers[0]?.city}</span></p>
                        <ul className="space-y-2">
                          {offers.map((o) => (
                            <li key={o.offerRef} className={cn('flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line px-3 py-2 text-xs', !o.available && 'opacity-60')}>
                              <div className="min-w-0 flex-1 space-y-1">
                                <p className="text-sm text-ink">
                                  {o.roomType} · <span className="font-semibold">{o.board}</span> <span className="text-muted">« {o.boardLabelOriginal} » — {boardLabels[o.board]}</span>
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-semibold tabular text-brand-900">{formatMoney(o.price.amount, o.price.currency)}</span>
                                  {o.price.taxesIncluded ? <Badge tone="success">Taxes incluses</Badge> : <Badge tone="warning">+ taxe de séjour {formatMoney(o.price.touristTax)}</Badge>}
                                  {o.refundable ? <Badge tone="info">Remboursable</Badge> : <Badge tone="danger">Non remboursable</Badge>}
                                  <Badge tone={o.available ? 'neutral' : 'danger'}>{o.available ? `${o.remaining ?? '?'} disponible(s)` : 'Épuisé'}</Badge>
                                </div>
                                <p className="text-muted">{o.cancellationPolicy} · {o.nights} nuit(s)</p>
                                <p className="break-all font-mono text-[10px] text-muted">Réf. fournisseur {o.offerRef} · consulté le {formatDateTimeFr(o.fetchedAt)}</p>
                              </div>
                              {serviceId ? (
                                o.available && r.capabilities?.book
                                  ? <Button type="button" size="sm" variant="secondary" disabled={pending || blocked} onClick={() => choose(r.code, r.label, o)}>Choisir</Button>
                                  : <span className="text-[11px] text-muted">{r.capabilities?.book ? '' : 'Réservation manuelle'}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
