'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatMoney, paymentMethodLabels } from '@hi/core'
import { Alert, Badge, Field, Input, Select, Table, Td, Textarea, Th } from '@hi/ui'
import { FormMessage } from '@/components/forms'
import { PendingButton, useStickyAction } from './sticky-form'
import type { ActionState } from '@/lib/actions'
import { parseAmount } from '@/lib/fin/format'

export interface OpenInvoice { id: string; number: string; client_id: string; dossier_ref: string | null; due_date: string | null; open_amount: number }
export interface OpenDossier { id: string; reference: string; client_id: string; balance: number }
export interface OpenSupplierInvoice { id: string; supplier_id: string; supplier_ref: string; due_date: string | null; remaining: number; currency: string }

type Target = { key: string; kind: 'invoice' | 'dossier' | 'supplier_invoice'; id: string; label: string; hint: string; open: number }

export function PaymentForm(props: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>
  idempotencyKey: string
  today: string
  clients: Array<{ id: string; display_name: string | null }>
  suppliers: Array<{ id: string; name: string }>
  accounts: Array<{ id: string; name: string; kind: string }>
  invoices: OpenInvoice[]
  dossiers: OpenDossier[]
  supplierInvoices: OpenSupplierInvoice[]
  defaults: { direction: 'in' | 'out'; kind: 'payment' | 'refund'; party: 'client' | 'supplier'; clientId?: string; supplierId?: string; invoiceId?: string; dossierId?: string; supplierInvoiceId?: string; amount?: number }
  canValidate: boolean
}) {
  const { defaults } = props
  const { state, onSubmit, pending } = useStickyAction(props.action)
  // Clé figée pour toute la vie du formulaire : une nouvelle soumission (double clic, rafraîchissement
  // des données après action) réutilise la même clé et ne crée jamais de doublon.
  const [idemKey] = useState(props.idempotencyKey)
  const [direction, setDirection] = useState(defaults.direction)
  const [kind, setKind] = useState(defaults.kind)
  const [party, setParty] = useState(defaults.party)
  const [clientId, setClientId] = useState(defaults.clientId ?? '')
  const [supplierId, setSupplierId] = useState(defaults.supplierId ?? '')
  const [method, setMethod] = useState('transfer')
  const [currency, setCurrency] = useState('TND')
  const [amount, setAmount] = useState(defaults.amount != null ? String(defaults.amount) : '')
  const [alloc, setAlloc] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    if (defaults.amount != null) {
      if (defaults.invoiceId) init[`invoice:${defaults.invoiceId}`] = String(defaults.amount)
      else if (defaults.supplierInvoiceId) init[`supplier_invoice:${defaults.supplierInvoiceId}`] = String(defaults.amount)
      else if (defaults.dossierId) init[`dossier:${defaults.dossierId}`] = String(defaults.amount)
    }
    return init
  })

  const targets: Target[] = useMemo(() => {
    if (party === 'supplier') {
      return props.supplierInvoices.filter((s) => s.supplier_id === supplierId).map((s) => ({
        key: `supplier_invoice:${s.id}`, kind: 'supplier_invoice', id: s.id, label: `Pièce ${s.supplier_ref}`,
        hint: s.due_date ? `échéance ${s.due_date}` : '', open: s.remaining,
      }))
    }
    const inv: Target[] = direction === 'in' && kind === 'payment'
      ? props.invoices.filter((i) => i.client_id === clientId).map((i) => ({
          key: `invoice:${i.id}`, kind: 'invoice', id: i.id, label: `Facture ${i.number}`,
          hint: [i.dossier_ref, i.due_date ? `échéance ${i.due_date}` : null].filter(Boolean).join(' · '), open: i.open_amount,
        }))
      : []
    const dos: Target[] = props.dossiers.filter((d) => d.client_id === clientId).map((d) => ({
      key: `dossier:${d.id}`, kind: 'dossier', id: d.id, label: `Dossier ${d.reference}`,
      hint: 'sans facture (acompte, tranche, remboursement)', open: d.balance,
    }))
    return [...inv, ...dos]
  }, [party, supplierId, clientId, direction, kind, props.invoices, props.dossiers, props.supplierInvoices])

  const total = parseAmount(amount) || 0
  const allocated = targets.reduce((a, t) => a + (parseAmount(alloc[t.key]) || 0), 0)
  const remainder = Math.round((total - allocated) * 1000) / 1000
  const allocJson = JSON.stringify(
    targets
      .filter((t) => (parseAmount(alloc[t.key]) || 0) > 0)
      .map((t) => ({ [`${t.kind}_id`]: t.id, amount: parseAmount(alloc[t.key]) })),
  )
  const needsInstrument = method === 'cheque' || method === 'bill'
  const fe = (k: string) => state.fieldErrors?.[k]?.[0]

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="idempotency_key" value={idemKey} />
      <input type="hidden" name="allocations" value={allocJson} />

      <fieldset className="grid gap-4 md:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-brand-900">Nature</legend>
        <Field label="Sens" htmlFor="direction">
          <Select id="direction" name="direction" value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
            <option value="in">Entrée (encaissement)</option>
            <option value="out">Sortie (décaissement)</option>
          </Select>
        </Field>
        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'payment' | 'refund')}>
            <option value="payment">Règlement</option>
            <option value="refund">Remboursement</option>
          </Select>
        </Field>
        <Field label="Tiers" htmlFor="party">
          <Select id="party" name="party" value={party} onChange={(e) => setParty(e.target.value as 'client' | 'supplier')}>
            <option value="client">Client</option>
            <option value="supplier">Fournisseur</option>
          </Select>
        </Field>
        {party === 'client' ? (
          <Field label="Client" htmlFor="client_id" required error={fe('client_id')}>
            <Select id="client_id" name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Choisir —</option>
              {props.clients.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Fournisseur" htmlFor="supplier_id" required error={fe('supplier_id')}>
            <Select id="supplier_id" name="supplier_id" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Choisir —</option>
              {props.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
      </fieldset>
      {direction === 'out' && party === 'client' ? (
        <Alert tone="warning">Sortie vers un client : remboursement ou trop-perçu. Il réduit l’encaissé du dossier affecté ; il ne supprime jamais l’encaissement initial.</Alert>
      ) : null}

      <fieldset className="grid gap-4 md:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-brand-900">Moyen et montant</legend>
        <Field label="Moyen de paiement" htmlFor="method" required>
          <Select id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(paymentMethodLabels).filter(([k]) => k !== 'online').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Montant" htmlFor="amount" required error={fe('amount')}>
          <Input id="amount" name="amount" inputMode="decimal" className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Devise" htmlFor="currency">
          <Select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['TND', 'EUR', 'USD', 'SAR'].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Taux vers TND" htmlFor="fx_rate" hint={currency === 'TND' ? '1 pour le TND' : 'Taux réellement appliqué, daté de la réception'}>
          <Input id="fx_rate" name="fx_rate" inputMode="decimal" defaultValue="1" disabled={currency === 'TND'} />
        </Field>
        <Field label="Date de réception" htmlFor="received_at" required error={fe('received_at')}>
          <Input id="received_at" name="received_at" type="date" defaultValue={props.today} required />
        </Field>
        <Field label="Compte de caisse / banque" htmlFor="treasury_account_id" error={fe('treasury_account_id')} hint="Obligatoire pour valider">
          <Select id="treasury_account_id" name="treasury_account_id" defaultValue="">
            <option value="">— À préciser —</option>
            {props.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Référence externe" htmlFor="external_ref" hint="N° de virement, autorisation carte…">
          <Input id="external_ref" name="external_ref" />
        </Field>
        <Field label="Frais bancaires" htmlFor="fees">
          <Input id="fees" name="fees" inputMode="decimal" defaultValue="0" className="text-right" />
        </Field>
        {needsInstrument ? (
          <>
            <Field label={method === 'bill' ? 'N° de traite' : 'N° de chèque'} htmlFor="instrument_number" required error={fe('instrument_number')}>
              <Input id="instrument_number" name="instrument_number" />
            </Field>
            <Field label="Échéance (date de valeur)" htmlFor="due_date" required={method === 'bill'} error={fe('due_date')} hint="Une échéance future n’est pas un encaissement disponible">
              <Input id="due_date" name="due_date" type="date" />
            </Field>
            <Field label="Banque tirée" htmlFor="drawer_bank">
              <Input id="drawer_bank" name="drawer_bank" />
            </Field>
          </>
        ) : null}
        {party === 'supplier' ? (
          <Field label="Retenue à la source" htmlFor="withholding">
            <Input id="withholding" name="withholding" inputMode="decimal" defaultValue="0" className="text-right" />
          </Field>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-brand-900">Affectation explicite</legend>
        {targets.length === 0 ? (
          <p className="rounded-card border border-dashed border-line p-4 text-sm text-muted">
            {party === 'client' && !clientId ? 'Choisissez le client pour afficher ses factures et dossiers ouverts.' :
              party === 'supplier' && !supplierId ? 'Choisissez le fournisseur pour afficher ses pièces ouvertes.' :
              'Aucune pièce ouverte : le règlement restera non affecté (visible dans la liste des règlements).'}
          </p>
        ) : (
          <div className="rounded-card border border-line">
            <Table>
              <thead><tr><Th>Pièce / dossier</Th><Th>Détail</Th><Th className="text-right">Solde ouvert</Th><Th className="w-44 text-right">Montant affecté</Th></tr></thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.key}>
                    <Td className="font-medium">{t.label}</Td>
                    <Td className="text-xs text-muted">{t.hint}</Td>
                    <Td className="text-right tabular">{formatMoney(t.open)}</Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setAlloc((a) => ({ ...a, [t.key]: String(Math.max(0, Math.min(t.open, Math.round((remainder + (parseAmount(a[t.key]) || 0)) * 1000) / 1000))) }))}>max</button>
                        <Input aria-label={`Montant affecté ${t.label}`} inputMode="decimal" className="text-right" value={alloc[t.key] ?? ''} onChange={(e) => setAlloc((a) => ({ ...a, [t.key]: e.target.value }))} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-4 text-sm">
          <span>Affecté : <strong className="tabular">{formatMoney(allocated, currency)}</strong></span>
          <span>
            Non affecté : <strong className="tabular">{formatMoney(remainder, currency)}</strong>
            {remainder < 0 ? <Badge tone="danger" className="ml-2">Affectation supérieure au montant</Badge> : null}
          </span>
        </div>
      </fieldset>

      <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} /></Field>
      {props.canValidate ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="validate_now" value="1" defaultChecked={method !== 'cheque' && method !== 'bill'} key={method} />
          Valider immédiatement (encaissement effectif : mouvement de trésorerie et écriture). Laisser décoché pour un chèque ou une traite à remettre.
        </label>
      ) : null}
      <FormMessage state={state} />
      {state.ok && state.id ? (
        <p className="flex flex-wrap gap-4 text-sm">
          <Link className="font-semibold text-brand-600 underline" href={`/finances/reglements/${state.id}`}>Ouvrir le règlement</Link>
          {/* Chargement complet : nouveau formulaire, nouvelle clé d'idempotence */}
          <button type="button" className="text-brand-600 underline" onClick={() => window.location.reload()}>Saisir un autre règlement</button>
        </p>
      ) : null}
      <div className="flex justify-end">
        <PendingButton pending={pending}>Enregistrer le règlement</PendingButton>
      </div>
    </form>
  )
}
