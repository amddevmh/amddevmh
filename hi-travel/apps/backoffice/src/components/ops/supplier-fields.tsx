import type { Tables } from '@hi/db'
import { Field, Input, Select, Textarea } from '@hi/ui'
import { supplierKindLabels } from '@/lib/ops/labels'

/** Champs de la fiche fournisseur (création et modification). */
export function SupplierFields({ s }: { s?: Tables<'suppliers'> }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Nom" htmlFor="name" required className="md:col-span-2"><Input id="name" name="name" defaultValue={s?.name ?? ''} /></Field>
      <Field label="Type" htmlFor="kind">
        <Select id="kind" name="kind" defaultValue={s?.kind ?? 'other'}>{Object.entries(supplierKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Pays" htmlFor="country"><Input id="country" name="country" defaultValue={s?.country ?? 'TN'} /></Field>
      <Field label="Ville" htmlFor="city"><Input id="city" name="city" defaultValue={s?.city ?? ''} /></Field>
      <Field label="Devise d’achat" htmlFor="currency"><Input id="currency" name="currency" maxLength={3} defaultValue={s?.currency ?? 'TND'} /></Field>
      <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={s?.email ?? ''} /></Field>
      <Field label="Téléphone" htmlFor="phone"><Input id="phone" name="phone" defaultValue={s?.phone ?? ''} /></Field>
      <Field label="Matricule fiscal" htmlFor="tax_id"><Input id="tax_id" name="tax_id" defaultValue={s?.tax_id ?? ''} /></Field>
      <Field label="Destinations couvertes" htmlFor="destinations" hint="Séparées par des virgules" className="md:col-span-2"><Input id="destinations" name="destinations" defaultValue={(s?.destinations ?? []).join(', ')} /></Field>
      <Field label="Compte comptable auxiliaire" htmlFor="account_code"><Input id="account_code" name="account_code" defaultValue={s?.account_code ?? ''} /></Field>
      <Field label="Conditions de paiement" htmlFor="payment_terms" className="md:col-span-3"><Input id="payment_terms" name="payment_terms" defaultValue={s?.payment_terms ?? ''} placeholder="Ex. 30 % à la réservation, solde 15 jours avant l’arrivée" /></Field>
      <Field label="Conditions générales" htmlFor="conditions" className="md:col-span-3"><Textarea id="conditions" name="conditions" defaultValue={s?.conditions ?? ''} className="min-h-16!" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="withholding_applicable" defaultChecked={s?.withholding_applicable ?? false} className="size-4" /> Retenue à la source applicable</label>
      {s ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} className="size-4" /> Fournisseur actif</label> : null}
    </div>
  )
}
