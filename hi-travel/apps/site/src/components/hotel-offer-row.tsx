'use client'

import { startTransition, useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { formatMoney } from '@hi/core'
import { Alert, Badge, Button, Select, buttonClass, cn } from '@hi/ui'
import { recheckHotelOffer, requestHotelOffer, type HotelRequestState } from '@/actions/hotels'
import type { PublicHotelOffer } from '@/lib/hotels'
import { t } from '@/lib/i18n'
import { FormField } from './form-field'
import { Icon } from './icons'
import { ConsentFields, ContactFields } from './request-fields'

const boardLabel: Record<string, string> = { RO: 'Logement seul', LPD: 'Logement petit-déjeuner', DP: 'Demi-pension', PC: 'Pension complète', ALL: 'All inclusive' }

interface Query { city: string; checkIn: string; checkOut: string; adults: number; children: number; rooms: number }

type Check =
  | { kind: 'checking' }
  | { kind: 'ok'; price: number; offer: PublicHotelOffer }
  | { kind: 'changed'; oldPrice: number; price: number; offer: PublicHotelOffer }
  | { kind: 'on_request'; reason: 'unavailable' | 'error' }

/** Ligne d'offre hôtel + parcours « Demander cette offre » (revérification, nouvelle acceptation, sur demande). */
export function HotelOfferRow({ offer, query, rowId }: { offer: PublicHotelOffer; query: Query; rowId: string }) {
  const h = t.hotels
  const [open, setOpen] = useState(false)
  const [check, setCheck] = useState<Check | null>(null)
  const [token, setToken] = useState('')
  const [, startCheck] = useTransition()

  async function onRequestClick() {
    setOpen(true)
    setToken(crypto.randomUUID())         // un jeton par ouverture du formulaire
    setCheck({ kind: 'checking' })
    startCheck(async () => {
      const res = await recheckHotelOffer({
        provider: offer.provider as 'hotel_api_tunisiabeds', offerRef: offer.offerRef, city: query.city as 'Hammamet',
        checkIn: query.checkIn, checkOut: query.checkOut, adults: query.adults, children: query.children, rooms: query.rooms,
      })
      if (res.status === 'available') {
        const changed = Math.abs(res.offer.salePrice - offer.salePrice) > 0.0005
        setCheck(changed ? { kind: 'changed', oldPrice: offer.salePrice, price: res.offer.salePrice, offer: res.offer } : { kind: 'ok', price: res.offer.salePrice, offer: res.offer })
      } else {
        setCheck({ kind: 'on_request', reason: res.status === 'unavailable' ? 'unavailable' : 'error' })
      }
    })
  }

  return (
    <li className="border-t border-line first:border-t-0">
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-brand-900">{offer.roomType}</p>
          <p className="mt-0.5 text-sm text-ink">
            {boardLabel[offer.board] ?? offer.board}
            {offer.boardLabelOriginal && offer.boardLabelOriginal.toLowerCase() !== (boardLabel[offer.board] ?? '').toLowerCase()
              ? <span className="text-muted"> ({offer.boardLabelOriginal})</span> : null}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={offer.refundable ? 'success' : 'warning'}>{offer.refundable ? h.refundable : h.nonRefundable}</Badge>
            {offer.taxesIncluded ? <Badge tone="info">{h.taxesIncluded}</Badge> : null}
            {!offer.available ? <Badge tone="danger">{h.soldOut}</Badge> : offer.remaining != null && offer.remaining <= 2 ? <Badge tone="accent">{h.remaining(offer.remaining)}</Badge> : null}
          </div>
          <p className="mt-1.5 text-xs text-muted">{offer.cancellationPolicy}</p>
          {offer.touristTax ? <p className="mt-0.5 text-xs text-warning-600">{h.touristTaxExtra(formatMoney(offer.touristTax, offer.currency))}</p> : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-2">
          <p className="text-right">
            <span className="block text-xs text-muted">{h.totalStay}</span>
            <span className="font-display text-xl font-semibold text-brand-700 tabular" data-testid="hotel-price">{formatMoney(offer.salePrice, offer.currency)}</span>
          </p>
          {!open ? (
            <Button variant={offer.available ? 'accent' : 'secondary'} size="sm" onClick={onRequestClick} aria-controls={`${rowId}-panel`} aria-expanded={open}>
              {offer.available ? h.requestThis : h.requestOnDemand}
            </Button>
          ) : null}
        </div>
      </div>
      {open && check ? (
        <RequestPanel id={`${rowId}-panel`} offer={offer} query={query} check={check} token={token} onClose={() => { setOpen(false); setCheck(null) }}
          onPriceChangedAgain={(price) => setCheck((c) => (c && (c.kind === 'ok' || c.kind === 'changed') ? { kind: 'changed', oldPrice: c.price, price, offer: c.offer } : c))}
        />
      ) : null}
    </li>
  )
}

function RequestPanel({ id, offer, query, check, token, onClose, onPriceChangedAgain }: {
  id: string; offer: PublicHotelOffer; query: Query; check: Check; token: string; onClose: () => void; onPriceChangedAgain: (p: number) => void
}) {
  const h = t.hotels
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [state, action, pending] = useActionState<HotelRequestState, FormData>(requestHotelOffer, { status: 'idle' })
  const [accepted, setAccepted] = useState(false)
  const [lastHandled, setLastHandled] = useState<HotelRequestState | null>(null)

  useEffect(() => { headingRef.current?.focus() }, [])

  // Prix encore modifié au moment de l'envoi : nouvelle acceptation requise
  if (state !== lastHandled) {
    setLastHandled(state)
    if (state.status === 'price_changed' && state.newPrice != null) {
      setAccepted(false)
      onPriceChangedAgain(state.newPrice)
    }
  }

  if (check.kind === 'checking') {
    return (
      <div id={id} className="mb-4 rounded-card bg-canvas p-5" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-muted"><span className="size-4 animate-spin rounded-full border-2 border-brand-300 border-t-transparent" aria-hidden />{h.checking}</p>
      </div>
    )
  }

  if (state.status === 'success') {
    return (
      <div id={id} className="mb-4 rounded-card border border-success-600/30 bg-success-50 p-5" role="status" aria-live="polite">
        <h4 className="font-display text-lg font-semibold text-brand-900">{t.form.ack.title}</h4>
        {state.reference ? <p className="mt-2 text-sm">{t.form.ack.reference} : <strong className="text-brand-700" data-testid="request-reference">{state.reference}</strong></p> : null}
        {state.onRequest ? <p className="mt-2 text-sm"><Badge tone="warning">{h.onRequestBadge}</Badge></p> : null}
        <p className="mt-2 text-sm">{t.form.ack.text}</p>
        <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-medium text-warning-600 ring-1 ring-warning-600/20">{t.form.ack.notBooking}</p>
      </div>
    )
  }

  const onRequest = check.kind === 'on_request'
  const price = check.kind === 'ok' || check.kind === 'changed' ? check.price : null
  const needsAcceptance = check.kind === 'changed'
  const err = state.status === 'error' ? state.fieldErrors : undefined

  function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (pending || (needsAcceptance && !accepted)) return
    const fd = new FormData(ev.currentTarget)
    startTransition(() => action(fd))
  }

  return (
    <div id={id} className="mb-4 rounded-card border border-brand-100 bg-brand-50/50 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h4 ref={headingRef} tabIndex={-1} className="font-display text-lg font-semibold text-brand-900 focus:outline-none">{h.summary}</h4>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-white hover:text-ink">
          <Icon name="close" className="size-5" /><span className="sr-only">{h.cancel}</span>
        </button>
      </div>
      <p className="mt-1 text-sm text-ink">
        {offer.hotelName} — {offer.roomType}, {boardLabel[offer.board] ?? offer.board} · {h.nightsFor(offer.nights, h.pax(query.adults, query.children))}
      </p>

      <div className="mt-4" aria-live="polite">
        {check.kind === 'ok' ? (
          <Alert tone="success" title={`${formatMoney(check.price, offer.currency)}`}>{h.recheckOk}</Alert>
        ) : null}
        {check.kind === 'changed' ? (
          <div className="rounded-lg bg-warning-50 p-4 ring-1 ring-inset ring-warning-600/20" data-testid="price-changed">
            <p className="font-semibold text-warning-600">{h.priceChanged}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-muted">{h.oldPrice}</dt><dd className="tabular line-through" data-testid="old-price">{formatMoney(check.oldPrice, offer.currency)}</dd></div>
              <div><dt className="text-muted">{h.newPrice}</dt><dd className="font-display text-lg font-semibold text-brand-900 tabular" data-testid="new-price">{formatMoney(check.price, offer.currency)}</dd></div>
            </dl>
            <label className="mt-3 flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="size-5 accent-brand-500" name="accept_new_price" />
              {h.acceptNewPrice}
            </label>
          </div>
        ) : null}
        {onRequest ? (
          <Alert tone="warning" title={h.onRequestBadge}>{check.reason === 'unavailable' ? h.unavailable : h.providerError}</Alert>
        ) : null}
        {state.status === 'error' && state.error ? <Alert tone="danger" className="mt-3">{state.error}</Alert> : null}
        {state.status === 'price_changed' && state.error ? <Alert tone="warning" className="mt-3">{state.error}</Alert> : null}
      </div>

      <form action={action} onSubmit={onSubmit} noValidate className="relative mt-5 space-y-6">
        <input type="hidden" name="submission_token" value={token} />
        <input type="hidden" name="provider" value={offer.provider} />
        <input type="hidden" name="offer_ref" value={offer.offerRef} />
        <input type="hidden" name="hotel_code" value={offer.providerHotelCode} />
        <input type="hidden" name="hotel_name" value={offer.hotelName} />
        <input type="hidden" name="room_type" value={offer.roomType} />
        <input type="hidden" name="board" value={offer.board} />
        <input type="hidden" name="city" value={query.city} />
        <input type="hidden" name="date_from" value={query.checkIn} />
        <input type="hidden" name="date_to" value={query.checkOut} />
        <input type="hidden" name="adults" value={query.adults} />
        <input type="hidden" name="children" value={query.children} />
        <input type="hidden" name="rooms" value={query.rooms} />
        <input type="hidden" name="accepted_price" value={price ?? ''} />
        {needsAcceptance ? (
          <>
            <input type="hidden" name="price_changed" value="1" />
            <input type="hidden" name="previous_price" value={check.oldPrice} />
          </>
        ) : null}

        <ContactFields prefix={id} errors={err} />

        {query.children > 0 ? (
          <div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: query.children }, (_, i) => (
                <FormField key={i} id={`${id}-age-${i}`} label={t.form.childAge(i + 1)} required>
                  <Select id={`${id}-age-${i}`} name="children_ages" required defaultValue="">
                    <option value="" disabled>—</option>
                    {Array.from({ length: 18 }, (_, a) => <option key={a} value={a}>{a} an{a > 1 ? 's' : ''}</option>)}
                  </Select>
                </FormField>
              ))}
            </div>
            {err?.children_ages ? <p className="mt-1 text-xs font-medium text-danger-700" role="alert">{err.children_ages}</p> : null}
          </div>
        ) : null}

        <ConsentFields prefix={id} errors={err} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted sm:max-w-sm">{t.form.noBookingNote}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass('ghost', 'md')}>{h.cancel}</button>
            <Button type="submit" variant="accent" disabled={pending || (needsAcceptance && !accepted)} aria-describedby={needsAcceptance && !accepted ? `${id}-accept-hint` : undefined}>
              {pending ? t.form.submitting : t.form.submit}
            </Button>
          </div>
        </div>
        {needsAcceptance && !accepted ? <p id={`${id}-accept-hint`} className={cn('text-right text-xs text-warning-600')}>{h.acceptRequired}</p> : null}
      </form>
    </div>
  )
}
