import { Field, Input, Select } from '@hi/ui'

/** Champs d’un voyageur (hors pièce d’identité, réservée au module identity). */
export function TravellerFields() {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Field label="Prénom" htmlFor="tr_first" required><Input id="tr_first" name="first_name" /></Field>
      <Field label="Nom" htmlFor="tr_last" required><Input id="tr_last" name="last_name" /></Field>
      <Field label="Type" htmlFor="tr_pax">
        <Select id="tr_pax" name="pax_type" defaultValue="adult"><option value="adult">Adulte</option><option value="child">Enfant</option><option value="infant">Bébé</option></Select>
      </Field>
      <Field label="Date de naissance" htmlFor="tr_birth"><Input id="tr_birth" name="birth_date" type="date" /></Field>
      <Field label="Nationalité" htmlFor="tr_nat"><Input id="tr_nat" name="nationality" defaultValue="TN" /></Field>
      <Field label="E-mail" htmlFor="tr_email"><Input id="tr_email" name="email" type="email" /></Field>
      <Field label="Téléphone" htmlFor="tr_phone"><Input id="tr_phone" name="phone" /></Field>
    </div>
  )
}
