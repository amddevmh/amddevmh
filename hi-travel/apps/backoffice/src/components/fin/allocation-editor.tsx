'use client'

import { useMemo, useState } from 'react'
import { allocateByWeight, checkAllocation, formatMoney } from '@hi/core'
import { Alert, Button, Field, Input, Select, Table, Td, Th } from '@hi/ui'
import { FormMessage } from '@/components/forms'
import type { ActionState } from '@/lib/actions'
import { parseAmount } from '@/lib/fin/format'
import { PendingButton, useStickyAction } from './sticky-form'

type TargetType = 'dossier' | 'departure' | 'service'
interface Row { type: TargetType; id: string; weight: string }

const METHODS = {
  percent: 'Pourcentage',
  nights: 'Nuitées (chambres et tarifs identiques)',
  pax: 'Passagers',
  manual: 'Clé manuelle',
} as const

export function AllocationEditor({ action, supplierInvoiceId, unallocated, currency, dossiers, departures, services }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>
  supplierInvoiceId: string
  unallocated: number
  currency: string
  dossiers: Array<{ id: string; label: string; pax: number }>
  departures: Array<{ id: string; label: string; pax: number }>
  services: Array<{ id: string; label: string; nights: number | null; quantity: number }>
}) {
  const { state, onSubmit, pending } = useStickyAction(action)
  const [method, setMethod] = useState<keyof typeof METHODS>('percent')
  const [amount, setAmount] = useState(String(unallocated))
  const [rows, setRows] = useState<Row[]>([{ type: 'departure', id: '', weight: '' }, { type: 'departure', id: '', weight: '' }])

  const options = (t: TargetType) => (t === 'dossier' ? dossiers : t === 'departure' ? departures : services)
  const suggestedWeight = (t: TargetType, id: string): string => {
    if (method === 'nights' && t === 'service') return String(services.find((s) => s.id === id)?.nights ?? '')
    if (method === 'pax' && t === 'dossier') return String(dossiers.find((d) => d.id === id)?.pax ?? '')
    if (method === 'pax' && t === 'departure') return String(departures.find((d) => d.id === id)?.pax ?? '')
    return ''
  }

  const total = parseAmount(amount) || 0
  const preview = useMemo(() => {
    const valid = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.id && (parseAmount(r.weight) || 0) > 0)
    const byRow = new Map<number, number>()
    if (valid.length === 0 || total <= 0) return { shares: [] as number[], byRow, error: null as string | null }
    try {
      const shares = allocateByWeight(total, valid.map(({ r, i }) => ({ key: i, weight: parseAmount(r.weight) || 0 })), currency)
      for (const s of shares) byRow.set(s.key, s.amount)
      return { shares: shares.map((s) => s.amount), byRow, error: null }
    } catch (e) {
      return { shares: [], byRow, error: (e as Error).message }
    }
  }, [rows, total, currency])
  const check = checkAllocation(unallocated, preview.shares, currency)
  const weightSum = rows.reduce((a, r) => a + (parseAmount(r.weight) || 0), 0)

  const targetsJson = JSON.stringify(rows.filter((r) => r.id && (parseAmount(r.weight) || 0) > 0).map((r) => ({ [`${r.type}_id`]: r.id, weight: parseAmount(r.weight) })))

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="supplier_invoice_id" value={supplierInvoiceId} />
      <input type="hidden" name="targets" value={targetsJson} />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Méthode" htmlFor="method">
          <Select id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value as keyof typeof METHODS)}>
            {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Nature du coût" htmlFor="cost_kind">
          <Select id="cost_kind" name="cost_kind" defaultValue="common">
            <option value="common">Commun (groupe, partagé)</option>
            <option value="individual">Individuel</option>
          </Select>
        </Field>
        <Field label={`Montant à ventiler (${currency})`} htmlFor="amount" hint={`Non ventilé : ${formatMoney(unallocated, currency)}`}>
          <Input id="amount" name="amount" inputMode="decimal" className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      {method === 'nights' ? <Alert tone="warning">Clé par nuitées uniquement si chambres et tarifs sont identiques ; sinon utilisez les lignes réelles de la facture (INT03).</Alert> : null}

      <div className="rounded-card border border-line">
        <Table>
          <thead><tr><Th className="w-40">Type de cible</Th><Th>Cible</Th><Th className="w-32 text-right">{method === 'percent' ? 'Pourcentage' : 'Poids'}</Th><Th className="w-40 text-right">Part prévue</Th><Th className="w-10" /></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const share = preview.byRow.get(i)
              return (
                <tr key={i}>
                  <Td>
                    <Select aria-label="Type de cible" value={r.type} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { type: e.target.value as TargetType, id: '', weight: x.weight } : x)))}>
                      <option value="departure">Départ / groupe</option>
                      <option value="dossier">Dossier</option>
                      <option value="service">Prestation</option>
                    </Select>
                  </Td>
                  <Td>
                    <Select aria-label="Cible" value={r.id} onChange={(e) => {
                      const id = e.target.value
                      setRows((rs) => rs.map((x, j) => (j === i ? { ...x, id, weight: x.weight || suggestedWeight(x.type, id) } : x)))
                    }}>
                      <option value="">— Choisir —</option>
                      {options(r.type).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </Select>
                  </Td>
                  <Td><Input aria-label="Poids" inputMode="decimal" className="text-right" value={r.weight} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} /></Td>
                  <Td className="text-right tabular">{share != null ? formatMoney(share, currency) : '—'}</Td>
                  <Td><button type="button" aria-label="Retirer" className="text-danger-700" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button></Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <Button type="button" size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, { type: rs[rs.length - 1]?.type ?? 'departure', id: '', weight: '' }])}>+ Ajouter une cible</Button>
          <div className="text-right">
            {method === 'percent' && weightSum > 0 && Math.abs(weightSum - 100) > 0.0001 ? <p className="text-xs text-warning-600">Somme des pourcentages : {weightSum} (les parts sont proportionnelles aux poids)</p> : null}
            <p>Total pièce non ventilé : <strong className="tabular">{formatMoney(unallocated, currency)}</strong></p>
            <p>Ventilé par cette proposition : <strong className="tabular">{formatMoney(check.allocated, currency)}</strong></p>
            <p>Reliquat après validation : <strong className={check.overAllocated ? 'text-danger-700' : 'tabular'}>{formatMoney(check.remaining, currency)}</strong></p>
          </div>
        </div>
      </div>
      {preview.error ? <Alert tone="danger">{preview.error}</Alert> : null}
      <p className="text-xs text-muted">Aperçu calculé avec la même règle que la base (dernière part = reliquat d’arrondi). L’enregistrement est effectué par la base, qui refuse toute surallocation.</p>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <PendingButton pending={pending} confirm="Enregistrer cette ventilation ? Elle sera historisée avec sa méthode.">Valider la ventilation</PendingButton>
      </div>
    </form>
  )
}
