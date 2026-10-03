'use client'

import { useMemo, useState } from 'react'
import { formatMoney } from '@hi/core'
import { Badge, Button, Field, Input, Select, Table, Td, Textarea, Th } from '@hi/ui'
import { FormMessage } from '@/components/forms'
import { PendingButton, useStickyAction } from './sticky-form'
import type { ActionState } from '@/lib/actions'
import { parseAmount } from '@/lib/fin/format'

export interface TaxOption {
  code: string
  label: string
  rate: number
  validated: boolean
}

export interface DraftLine {
  description: string
  quantity: string
  unit_price: string
  tax_code: string
  activity?: string | null
  service_id?: string | null
}

export function InvoiceForm({ action, clients, dossiers, taxes, defaultClientId, defaultDossierId, defaultKind = 'invoice', initialLines }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>
  clients: Array<{ id: string; display_name: string | null }>
  dossiers: Array<{ id: string; reference: string; title: string; client_id: string }>
  taxes: TaxOption[]
  defaultClientId?: string
  defaultDossierId?: string
  defaultKind?: 'invoice' | 'proforma'
  initialLines: DraftLine[]
}) {
  const { state, onSubmit, pending } = useStickyAction(action)
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [lines, setLines] = useState<DraftLine[]>(initialLines.length ? initialLines : [{ description: '', quantity: '1', unit_price: '', tax_code: taxes[0]?.code ?? '' }])
  const defaultTax = taxes.find((t) => t.rate === 0)?.code ?? taxes[0]?.code ?? ''

  const totals = useMemo(() => {
    let ht = 0
    let tax = 0
    for (const l of lines) {
      const lineHt = Math.round((parseAmount(l.quantity) || 0) * (parseAmount(l.unit_price) || 0) * 1000) / 1000
      const rate = taxes.find((t) => t.code === l.tax_code)?.rate ?? 0
      ht += lineHt
      tax += Math.round(lineHt * rate * 1000) / 1000
    }
    return { ht, tax }
  }, [lines, taxes])

  const update = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const unvalidated = lines.some((l) => taxes.find((t) => t.code === l.tax_code && !t.validated))

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Type de pièce" htmlFor="kind" required>
          <Select id="kind" name="kind" defaultValue={defaultKind}>
            <option value="invoice">Facture</option>
            <option value="proforma">Pro forma (sans chiffre d’affaires)</option>
          </Select>
        </Field>
        <Field label="Client payeur" htmlFor="client_id" required error={state.fieldErrors?.client_id?.[0]}>
          <Select id="client_id" name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— Choisir —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </Select>
        </Field>
        <Field label="Dossier (optionnel)" htmlFor="dossier_id">
          <Select id="dossier_id" name="dossier_id" defaultValue={defaultDossierId ?? ''}>
            <option value="">— Aucun —</option>
            {dossiers.filter((d) => !clientId || d.client_id === clientId).map((d) => (
              <option key={d.id} value={d.id}>{d.reference} — {d.title}</option>
            ))}
          </Select>
        </Field>
        <Field label="Échéance" htmlFor="due_date" hint="Par défaut : 30 jours après l’émission">
          <Input id="due_date" name="due_date" type="date" />
        </Field>
      </div>

      <div className="rounded-card border border-line">
        <Table>
          <thead>
            <tr>
              <Th>Désignation</Th>
              <Th className="w-24 text-right">Qté</Th>
              <Th className="w-36 text-right">Prix unitaire HT</Th>
              <Th className="w-56">Taxe</Th>
              <Th className="w-36 text-right">Total HT</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const lineHt = (parseAmount(l.quantity) || 0) * (parseAmount(l.unit_price) || 0)
              const tax = taxes.find((t) => t.code === l.tax_code)
              return (
                <tr key={i}>
                  <Td><Input aria-label="Désignation" value={l.description} onChange={(e) => update(i, { description: e.target.value })} /></Td>
                  <Td><Input aria-label="Quantité" inputMode="decimal" className="text-right" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} /></Td>
                  <Td><Input aria-label="Prix unitaire" inputMode="decimal" className="text-right" value={l.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} /></Td>
                  <Td>
                    <Select aria-label="Code taxe" value={l.tax_code} onChange={(e) => update(i, { tax_code: e.target.value })}>
                      <option value="">Sans taxe</option>
                      {taxes.map((t) => <option key={t.code} value={t.code}>{t.label} ({(t.rate * 100).toFixed(2)} %)</option>)}
                    </Select>
                    {tax && !tax.validated ? <Badge tone="warning" className="mt-1">À valider par le comptable</Badge> : null}
                  </Td>
                  <Td className="text-right tabular">{formatMoney(lineHt)}</Td>
                  <Td>
                    <button type="button" className="text-sm text-danger-700 hover:underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Retirer la ligne">✕</button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { description: '', quantity: '1', unit_price: '', tax_code: defaultTax }])}>
            + Ajouter une ligne
          </Button>
          <div className="text-right text-sm">
            <p>Total HT : <strong className="tabular">{formatMoney(totals.ht)}</strong></p>
            <p>Taxes : <strong className="tabular">{formatMoney(totals.tax)}</strong></p>
            <p className="text-xs text-muted">Aperçu. Les totaux définitifs (et le timbre éventuel) sont calculés par la base à la validation.</p>
          </div>
        </div>
      </div>
      {unvalidated ? (
        <p className="text-xs text-warning-600">Au moins un code de taxe n’est pas encore validé par le comptable (FIN08).</p>
      ) : null}

      <Field label="Notes (imprimées sur la pièce)" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({ ...l, quantity: parseAmount(l.quantity), unit_price: parseAmount(l.unit_price) })))} />
      <FormMessage state={state} />
      <div className="flex justify-end">
        <PendingButton pending={pending}>Enregistrer le brouillon</PendingButton>
      </div>
    </form>
  )
}
