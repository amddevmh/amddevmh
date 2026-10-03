'use client'

import { useState } from 'react'
import { serviceStatusLabels } from '@hi/core'
import { Field, Input, Select } from '@hi/ui'
import { setServiceStatus } from '@/lib/ops/actions/dossiers'
import { OpsForm, OpsSubmit } from './ops-form'

/**
 * Demande → Option (date limite + source) → Confirmée (référence, preuve) → Annulée (motif).
 * Les états restent distincts : une option n’est jamais présentée comme confirmée.
 */
export function ServiceStatusForm({ serviceId, dossierId, status, documents, canMargins }: {
  serviceId: string; dossierId: string; status: string; documents: Array<{ id: string; title: string }>; canMargins: boolean
}) {
  const [next, setNext] = useState(status === 'requested' ? 'option' : status === 'option' ? 'confirmed' : status)
  return (
    <OpsForm action={setServiceStatus}>
      <input type="hidden" name="id" value={serviceId} />
      <input type="hidden" name="dossier_id" value={dossierId} />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Nouveau statut" htmlFor={`st-${serviceId}`}>
          <Select id={`st-${serviceId}`} name="status" value={next} onChange={(e) => setNext(e.target.value)}>
            {['requested', 'option', 'confirmed', 'cancelled'].map((s) => <option key={s} value={s}>{serviceStatusLabels[s]}</option>)}
          </Select>
        </Field>
        {next === 'option' ? (
          <>
            <Field label="Date limite de l’option (heure de Tunis)" htmlFor={`od-${serviceId}`} required>
              <Input id={`od-${serviceId}`} name="option_deadline" type="datetime-local" />
            </Field>
            <Field label="Source de la date" htmlFor={`os-${serviceId}`} required hint="E-mail fournisseur, API, contrat…">
              <Input id={`os-${serviceId}`} name="option_source" />
            </Field>
          </>
        ) : null}
        {next === 'confirmed' ? (
          <>
            <Field label="Référence de confirmation fournisseur" htmlFor={`cr-${serviceId}`} required>
              <Input id={`cr-${serviceId}`} name="confirmation_ref" />
            </Field>
            <Field label="Preuve de confirmation" htmlFor={`cd-${serviceId}`} hint={documents.length ? 'Document du dossier' : 'Déposer d’abord la preuve dans l’onglet Documents'}>
              <Select id={`cd-${serviceId}`} name="confirmation_document_id" defaultValue="">
                <option value="">— Aucune (à joindre) —</option>
                {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </Select>
            </Field>
            {canMargins ? (
              <Field label="Coût confirmé (devise d’achat)" htmlFor={`cc-${serviceId}`}>
                <Input id={`cc-${serviceId}`} name="cost_confirmed" type="number" min={0} step="0.001" />
              </Field>
            ) : null}
          </>
        ) : null}
        {next === 'cancelled' ? (
          <Field label="Motif d’annulation" htmlFor={`cx-${serviceId}`} required className="md:col-span-2">
            <Input id={`cx-${serviceId}`} name="cancel_reason" />
          </Field>
        ) : null}
      </div>
      <OpsSubmit size="sm" variant={next === 'cancelled' ? 'danger' : 'primary'} confirm={next === 'cancelled' ? 'Annuler cette prestation ?' : undefined}>Appliquer</OpsSubmit>
    </OpsForm>
  )
}
