'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatMoney } from '@hi/core'
import { Badge, Button, Field, Input, Select, Table, Td, Th } from '@hi/ui'
import { FormMessage } from '@/components/forms'
import type { ActionState } from '@/lib/actions'
import { parseAmount } from '@/lib/fin/format'
import { PendingButton, useStickyAction } from './sticky-form'

interface Line { account_code: string; label: string; debit: string; credit: string }

export function EntryForm({ action, journals, accounts, initial, canValidate, today }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>
  journals: Array<{ code: string; label: string }>
  accounts: Array<{ code: string; label: string; allow_posting: boolean; active: boolean }>
  initial?: { id: string; journal_code: string; entry_date: string; piece_ref: string; label: string; lines: Line[] }
  canValidate: boolean
  today: string
}) {
  const { state, onSubmit, pending } = useStickyAction(action)
  const [savedId, setSavedId] = useState(initial?.id)
  if (state.id && state.id !== savedId) setSavedId(state.id)
  const [lines, setLines] = useState<Line[]>(initial?.lines.length ? initial.lines : [
    { account_code: '', label: '', debit: '', credit: '' },
    { account_code: '', label: '', debit: '', credit: '' },
  ])
  const known = new Map(accounts.map((a) => [a.code, a]))
  const debit = lines.reduce((s, l) => s + Math.round((parseAmount(l.debit) || 0) * 1000), 0) / 1000
  const credit = lines.reduce((s, l) => s + Math.round((parseAmount(l.credit) || 0) * 1000), 0) / 1000
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Après un premier enregistrement, les corrections mettent à jour la même pièce (pas de doublon) */}
      {savedId ? <input type="hidden" name="entry_id" value={savedId} /> : null}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Journal" htmlFor="journal_code" required>
          <Select id="journal_code" name="journal_code" defaultValue={initial?.journal_code ?? 'OD'}>
            {journals.map((j) => <option key={j.code} value={j.code}>{j.code} — {j.label}</option>)}
          </Select>
        </Field>
        <Field label="Date" htmlFor="entry_date" required><Input id="entry_date" name="entry_date" type="date" defaultValue={initial?.entry_date ?? today} /></Field>
        <Field label="Référence de pièce" htmlFor="piece_ref" required hint="Permet de retrouver la pièce source" error={state.fieldErrors?.piece_ref?.[0]}>
          <Input id="piece_ref" name="piece_ref" defaultValue={initial?.piece_ref ?? ''} />
        </Field>
        <Field label="Libellé" htmlFor="label" required error={state.fieldErrors?.label?.[0]}><Input id="label" name="label" defaultValue={initial?.label ?? ''} /></Field>
      </div>
      <datalist id="account-codes">
        {accounts.filter((a) => a.active && a.allow_posting).map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
      </datalist>
      <div className="rounded-card border border-line">
        <Table>
          <thead><tr><Th className="w-48">Compte</Th><Th>Libellé de ligne</Th><Th className="w-40 text-right">Débit</Th><Th className="w-40 text-right">Crédit</Th><Th className="w-10" /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const acc = known.get(l.account_code)
              return (
                <tr key={i}>
                  <Td>
                    <Input aria-label="Compte" list="account-codes" className="font-mono" value={l.account_code} onChange={(e) => set(i, { account_code: e.target.value.trim() })} />
                    {l.account_code ? (acc ? <span className="text-xs text-muted">{acc.label}</span> : <Badge tone="danger" className="mt-1">Compte inconnu</Badge>) : null}
                  </Td>
                  <Td><Input aria-label="Libellé" value={l.label} onChange={(e) => set(i, { label: e.target.value })} /></Td>
                  <Td><Input aria-label="Débit" inputMode="decimal" className="text-right" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} /></Td>
                  <Td><Input aria-label="Crédit" inputMode="decimal" className="text-right" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} /></Td>
                  <Td><button type="button" aria-label="Retirer" className="text-danger-700" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button></Td>
                </tr>
              )
            })}
            <tr className="font-semibold">
              <Td colSpan={2} className="text-right text-xs uppercase">Totaux</Td>
              <Td className="text-right tabular">{formatMoney(debit)}</Td>
              <Td className="text-right tabular">{formatMoney(credit)}</Td>
              <Td />
            </tr>
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Button type="button" size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, { account_code: '', label: '', debit: '', credit: '' }])}>+ Ajouter une ligne</Button>
          {debit !== credit ? <Badge tone="danger">Écart débit − crédit : {formatMoney(debit - credit)}</Badge> : debit > 0 ? <Badge tone="success">Pièce équilibrée</Badge> : null}
        </div>
      </div>
      <p className="text-xs text-muted">Une pièce déséquilibrée ou comportant un compte inconnu peut être enregistrée en brouillard, mais sa validation sera refusée par la base (aucune ligne comptabilisée).</p>
      <FormMessage state={state} />
      {state.id ? <p className="text-sm"><Link className="text-brand-600 underline" href="/comptabilite">Voir le brouillard</Link></p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <PendingButton pending={pending} variant="secondary">Enregistrer en brouillard</PendingButton>
        {canValidate ? <PendingButton pending={pending} name="post_now" value="1" confirm="Enregistrer et valider définitivement cette pièce ?">Enregistrer et valider</PendingButton> : null}
      </div>
    </form>
  )
}
