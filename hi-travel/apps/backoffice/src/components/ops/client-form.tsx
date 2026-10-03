'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useActionState, useEffect, useState } from 'react'
import { leadSourceLabels } from '@hi/core'
import { Alert, Button, Field, Input, Select, Textarea } from '@hi/ui'
import { FormMessage, fieldError } from '@/components/forms'
import { createClientAction } from '@/lib/ops/actions/crm'
import type { ClientFormState } from '@/lib/ops/types'

export interface ClientDefaults {
  kind?: 'person' | 'company'
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  email?: string | null
  phone?: string | null
  source?: string | null
  lead_id?: string
  consent_processing?: boolean
  consent_marketing?: boolean
}

/** Création client avec contrôle des doublons avant enregistrement. */
export function ClientCreateForm({ defaults }: { defaults?: ClientDefaults }) {
  const [state, action, pending] = useActionState(createClientAction, { ok: false } as ClientFormState)
  const [kind, setKind] = useState<'person' | 'company'>(defaults?.kind ?? 'person')
  const router = useRouter()
  useEffect(() => {
    if (state.ok && state.id) router.push(`/crm/clients/${state.id}`)
  }, [state, router])
  const dups = state.duplicates ?? []

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(() => action(fd))
      }}
    >
      {defaults?.lead_id ? <input type="hidden" name="lead_id" value={defaults.lead_id} /> : null}
      <fieldset className="flex gap-4">
        <legend className="mb-1 text-sm font-medium">Type de fiche</legend>
        {(['person', 'company'] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="size-4" />
            {k === 'person' ? 'Particulier' : 'Entreprise'}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        {kind === 'person' ? (
          <>
            <Field label="Prénom" htmlFor="first_name" error={fieldError(state, 'first_name')}>
              <Input id="first_name" name="first_name" defaultValue={defaults?.first_name ?? ''} />
            </Field>
            <Field label="Nom" htmlFor="last_name" required error={fieldError(state, 'last_name')}>
              <Input id="last_name" name="last_name" defaultValue={defaults?.last_name ?? ''} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Raison sociale" htmlFor="company_name" required error={fieldError(state, 'company_name')}>
              <Input id="company_name" name="company_name" defaultValue={defaults?.company_name ?? ''} />
            </Field>
            <Field label="Matricule fiscal" htmlFor="tax_id">
              <Input id="tax_id" name="tax_id" />
            </Field>
          </>
        )}
        <Field label="E-mail" htmlFor="email" error={fieldError(state, 'email')}>
          <Input id="email" name="email" type="email" defaultValue={defaults?.email ?? ''} />
        </Field>
        <Field label="Téléphone" htmlFor="phone" error={fieldError(state, 'phone')} hint="Un e-mail ou un téléphone est requis">
          <Input id="phone" name="phone" type="tel" defaultValue={defaults?.phone ?? ''} />
        </Field>
        <Field label="Ville" htmlFor="city"><Input id="city" name="city" /></Field>
        <Field label="Pays" htmlFor="country"><Input id="country" name="country" defaultValue="TN" maxLength={2} /></Field>
        <Field label="Adresse" htmlFor="address" className="md:col-span-2"><Input id="address" name="address" /></Field>
        <Field label="Langue de communication" htmlFor="language">
          <Select id="language" name="language" defaultValue="fr">
            <option value="fr">Français</option><option value="en">Anglais</option><option value="ar">Arabe</option>
          </Select>
        </Field>
        <Field label="Source du contact" htmlFor="source">
          <Select id="source" name="source" defaultValue={defaults?.source ?? 'phone'}>
            {Object.entries(leadSourceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {kind === 'company' ? (
          <Field label="Conditions commerciales" htmlFor="commercial_terms" className="md:col-span-2">
            <Textarea id="commercial_terms" name="commercial_terms" className="min-h-16!" placeholder="Délais de paiement, bon de commande…" />
          </Field>
        ) : null}
        <Field label="Notes" htmlFor="notes" className="md:col-span-2"><Textarea id="notes" name="notes" className="min-h-16!" /></Field>
      </div>
      <fieldset className="space-y-2 rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-medium">Consentements</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent_processing" defaultChecked={defaults?.consent_processing ?? true} className="size-4" /> Accord pour le traitement de la demande</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent_marketing" defaultChecked={defaults?.consent_marketing ?? false} className="size-4" /> Accepte les communications commerciales</label>
      </fieldset>

      {dups.length ? (
        <Alert tone="warning" title="Doublons possibles détectés">
          <ul className="mt-2 space-y-1">
            {dups.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/crm/clients/${d.id}`} target="_blank" className="font-semibold underline">{d.display_name}</Link>
                <span className="text-xs">{[d.email, d.phone].filter(Boolean).join(' · ')}</span>
                <span className="rounded bg-white/70 px-1.5 text-xs">{d.match_reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Si l’une de ces fiches correspond, utilisez-la plutôt que d’en créer une nouvelle (une fusion ultérieure reste possible avec motif).</p>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="confirm_new" className="size-4" required /> Je confirme qu’il s’agit d’un nouveau client distinct
          </label>
        </Alert>
      ) : null}
      {!dups.length ? <FormMessage state={state} /> : null}
      <Button type="submit" disabled={pending}>{pending ? 'Vérification…' : dups.length ? 'Créer malgré les doublons signalés' : 'Vérifier les doublons et créer'}</Button>
    </form>
  )
}
