import Link from 'next/link'
import { Input } from '@hi/ui'
import { t } from '@/lib/i18n'
import { CheckboxField, Fieldset, FormField, a11yProps } from './form-field'

type Errors = Record<string, string> | undefined

/** Coordonnées : nom, e-mail ou téléphone (aucune pièce d'identité au premier contact). */
export function ContactFields({ prefix, errors }: { prefix: string; errors: Errors }) {
  const f = t.form
  const id = (n: string) => `${prefix}-${n}`
  return (
    <Fieldset legend={f.contactSection}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={id('first_name')} label={f.firstName} error={errors?.first_name}>
          <Input name="first_name" autoComplete="given-name" maxLength={80} {...a11yProps(id('first_name'), errors?.first_name)} />
        </FormField>
        <FormField id={id('last_name')} label={f.lastName} required error={errors?.last_name}>
          <Input name="last_name" autoComplete="family-name" required minLength={2} maxLength={80} {...a11yProps(id('last_name'), errors?.last_name)} />
        </FormField>
        <FormField id={id('email')} label={f.email} error={errors?.email} hint={f.contactHint}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" maxLength={160} {...a11yProps(id('email'), errors?.email, f.contactHint)} />
        </FormField>
        <FormField id={id('phone')} label={f.phone} error={errors?.phone}>
          <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={20} placeholder="+216 …" {...a11yProps(id('phone'), errors?.phone)} />
        </FormField>
      </div>
    </Fieldset>
  )
}

/** Accord de traitement (obligatoire) distinct du consentement marketing (facultatif) + pot de miel. */
export function ConsentFields({ prefix, errors }: { prefix: string; errors: Errors }) {
  const f = t.form
  return (
    <div className="space-y-3">
      <CheckboxField
        id={`${prefix}-processing_consent`}
        name="processing_consent"
        required
        error={errors?.processing_consent}
        label={<>{f.processingConsent} <Link href="/confidentialite" className="text-brand-600 underline underline-offset-2">{f.privacyLink}</Link></>}
      />
      <CheckboxField id={`${prefix}-marketing_consent`} name="marketing_consent" label={f.marketingConsent} />
      {/* Pot de miel : invisible pour les visiteurs, ignoré par les lecteurs d'écran */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${prefix}-website`}>{f.honeypot}</label>
        <input id={`${prefix}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
    </div>
  )
}
