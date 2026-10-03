'use client'

import { useActionState, useState } from 'react'
import { formatDateTimeFr } from '@hi/core'
import { Alert, Badge, Button, Field, Input, buttonClass } from '@hi/ui'
import { OneTimePassword, PasswordField, PasswordResetForm, submitWithoutReset } from '@/components/password-tools'
import { createClientAccess, resetClientAccessPassword, revokeClientAccess } from '@/lib/ops/actions/client-access'
import type { PasswordActionState } from '@/lib/password'

export interface ClientAccessAccount {
  userId: string
  /** Identifiant de connexion (lu avec la clé service, uniquement pour les détenteurs de crm.update) */
  email: string | null
  createdAt: string
  lastSignInAt?: string | null
}

const initial = { ok: false } as PasswordActionState

/**
 * Carte « Accès à l’espace client » de la fiche client. Les trois actions partagent ce composant
 * pour que le mot de passe affiché une fois reste visible quand la fiche se rafraîchit.
 */
export function ClientAccessCard({ clientId, clientEmail, accounts, canManage, portalUrl }: {
  clientId: string
  clientEmail: string | null
  accounts: ClientAccessAccount[]
  canManage: boolean
  portalUrl: string
}) {
  const [createState, createAction, creating] = useActionState(createClientAccess, initial)
  const [revokeState, revokeAction, revoking] = useActionState(revokeClientAccess, initial)
  const [email, setEmail] = useState(clientEmail ?? '')
  const [password, setPassword] = useState('')
  const [createdAt, setCreatedAt] = useState<number | undefined>(undefined)
  const [resetAt, setResetAt] = useState(0)
  if (createState.ok && createState.issuedAt && createState.issuedAt !== createdAt) {
    setCreatedAt(createState.issuedAt)
    setPassword('')
  }
  const hasAccess = accounts.length > 0
  const portalLink = (
    <a href={portalUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'sm')}>Voir l’espace client ↗</a>
  )

  return (
    <div className="space-y-4" data-testid="client-access">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasAccess ? <Badge tone="success">Accès actif</Badge> : <Badge>Aucun accès</Badge>}
        {portalLink}
      </div>

      {hasAccess && createState.ok && createState.password && (createState.issuedAt ?? 0) > resetAt ? (
        <OneTimePassword password={createState.password} email={createState.email} title="Accès créé" />
      ) : null}
      {!hasAccess && revokeState.ok && revokeState.message ? <Alert tone="success">{revokeState.message}</Alert> : null}
      {revokeState.error ? <Alert tone="danger">{revokeState.error}</Alert> : null}

      {hasAccess ? accounts.map((a) => (
        <div key={a.userId} className="space-y-3 rounded-lg border border-line p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">Identifiant de connexion</dt>
              <dd className="mt-0.5 font-medium" data-testid="client-access-email">{a.email ?? 'Visible avec le droit de modification CRM'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">Accès créé le</dt>
              <dd className="mt-0.5">{formatDateTimeFr(a.createdAt)}</dd>
            </div>
            {a.lastSignInAt !== undefined ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">Dernière connexion</dt>
                <dd className="mt-0.5">{a.lastSignInAt ? formatDateTimeFr(a.lastSignInAt) : 'Jamais'}</dd>
              </div>
            ) : null}
          </dl>
          {canManage ? (
            <div className="grid gap-4 border-t border-line pt-3 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-brand-900">Réinitialiser le mot de passe</h3>
                <PasswordResetForm
                  action={resetClientAccessPassword}
                  hidden={{ client_id: clientId, user_id: a.userId }}
                  idPrefix={`reset-${a.userId}`}
                  onIssued={setResetAt}
                  confirm="Remplacer le mot de passe actuel du client ? Il ne pourra plus se connecter avec l’ancien."
                />
              </div>
              <form
                onSubmit={submitWithoutReset(revokeAction, 'Révoquer l’accès à l’espace client ? L’identifiant sera supprimé et ne permettra plus de se connecter. La fiche client est conservée.')}
                className="space-y-3"
              >
                <h3 className="text-sm font-semibold text-brand-900">Révoquer l’accès</h3>
                <input type="hidden" name="client_id" value={clientId} />
                <input type="hidden" name="user_id" value={a.userId} />
                <Field label="Motif" htmlFor={`revoke-reason-${a.userId}`} required hint="Consigné dans les échanges de la fiche">
                  <Input id={`revoke-reason-${a.userId}`} name="reason" required minLength={5} placeholder="Ex. demande du client, contrat terminé" />
                </Field>
                <Button type="submit" size="sm" variant="danger" disabled={revoking}>{revoking ? 'Révocation…' : 'Révoquer l’accès'}</Button>
              </form>
            </div>
          ) : null}
        </div>
      )) : canManage ? (
        <form onSubmit={submitWithoutReset(createAction)} className="space-y-3">
          <p className="text-sm text-muted">Le client se connecte au site avec cet identifiant pour suivre ses dossiers, documents et paiements.</p>
          <input type="hidden" name="client_id" value={clientId} />
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="E-mail de connexion" htmlFor="access-email" required error={createState.fieldErrors?.email?.[0]}>
              <Input id="access-email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <PasswordField id="access-password" label="Mot de passe initial" value={password} onChange={setPassword} error={createState.fieldErrors?.password?.[0]} />
          </div>
          <Button type="submit" size="sm" disabled={creating}>{creating ? 'Création…' : 'Créer l’accès'}</Button>
          {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
        </form>
      ) : (
        <p className="text-sm text-muted">Ce client n’a pas d’accès à l’espace client. La création est réservée aux collaborateurs autorisés à modifier le CRM.</p>
      )}
    </div>
  )
}
