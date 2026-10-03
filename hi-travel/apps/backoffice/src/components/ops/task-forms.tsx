import { ACTIVITIES, activityLabels } from '@hi/core'
import { Field, Input, Select, Textarea } from '@hi/ui'
import { OpsForm as ActionForm, OpsSubmit as SubmitButton } from './ops-form'
import { createDeadline, createTask } from '@/lib/ops/actions/tasks'
import { deadlineKindLabels, deadlineSourceLabels } from '@/lib/ops/labels'
import { LabelSelect, StaffSelect } from './ui'

type Staff = Array<{ id: string; full_name: string; active?: boolean }>
type DossierOpt = Array<{ id: string; reference: string; title: string }>

/** Création d’une tâche (affectation manuelle — phase 1). */
export function TaskCreateForm({ staff, dossiers, dossierId, services, defaultAssignee }: {
  staff: Staff; dossiers?: DossierOpt; dossierId?: string; services?: Array<{ id: string; description: string }>; defaultAssignee?: string | null
}) {
  return (
    <ActionForm action={createTask} resetOnSuccess>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Action attendue" htmlFor="title" required className="md:col-span-2">
          <Input id="title" name="title" required minLength={3} placeholder="Ex. Confirmer le transfert aéroport" />
        </Field>
        {dossierId ? <input type="hidden" name="dossier_id" value={dossierId} /> : (
          <Field label="Dossier" htmlFor="dossier_id" hint="Facultatif : tâche interne sinon">
            <Select id="dossier_id" name="dossier_id" defaultValue="">
              <option value="">— Aucun dossier —</option>
              {(dossiers ?? []).map((d) => <option key={d.id} value={d.id}>{d.reference} — {d.title}</option>)}
            </Select>
          </Field>
        )}
        {services?.length ? (
          <Field label="Prestation concernée" htmlFor="service_id">
            <Select id="service_id" name="service_id" defaultValue="">
              <option value="">— Aucune —</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.description}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Responsable" htmlFor="assignee_id">
          <StaffSelect staff={staff} name="assignee_id" defaultValue={defaultAssignee} />
        </Field>
        <Field label="Échéance (heure de Tunis)" htmlFor="due_at">
          <Input id="due_at" name="due_at" type="datetime-local" />
        </Field>
        <Field label="Activité" htmlFor="activity">
          <Select id="activity" name="activity" defaultValue="">
            <option value="">—</option>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="financial_risk" className="size-4" /> Risque de perte financière (pénalité, annulation)
        </label>
        <Field label="Détails" htmlFor="description" className="md:col-span-2">
          <Textarea id="description" name="description" className="min-h-16!" />
        </Field>
      </div>
      <SubmitButton>Créer la tâche</SubmitButton>
    </ActionForm>
  )
}

/** Ajout d’une échéance contractuelle : date + source justifiée, ou « délai à compléter ». */
export function DeadlineCreateForm({ dossiers, dossierId, services, staff }: {
  dossiers?: DossierOpt; dossierId?: string; services?: Array<{ id: string; description: string }>; staff: Staff
}) {
  return (
    <ActionForm action={createDeadline} resetOnSuccess>
      <div className="grid gap-4 md:grid-cols-3">
        {dossierId ? <input type="hidden" name="dossier_id" value={dossierId} /> : (
          <Field label="Dossier" htmlFor="dl_dossier" required>
            <Select id="dl_dossier" name="dossier_id" required defaultValue="">
              <option value="" disabled>Choisir…</option>
              {(dossiers ?? []).map((d) => <option key={d.id} value={d.id}>{d.reference} — {d.title}</option>)}
            </Select>
          </Field>
        )}
        {services?.length ? (
          <Field label="Prestation" htmlFor="dl_service">
            <Select id="dl_service" name="service_id" defaultValue="">
              <option value="">— Dossier entier —</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.description}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Type" htmlFor="dl_kind" required>
          <LabelSelect labels={deadlineKindLabels} name="kind" id="dl_kind" required />
        </Field>
        <Field label="Libellé" htmlFor="dl_label" required>
          <Input id="dl_label" name="label" required placeholder="Ex. Limite d’émission Tunisair" />
        </Field>
        <Field label="Date limite (heure locale)" htmlFor="dl_due" hint="Laisser vide si inconnue : « délai à compléter » + tâche de collecte">
          <Input id="dl_due" name="due_at" type="datetime-local" />
        </Field>
        <Field label="Fuseau" htmlFor="dl_tz">
          <Select id="dl_tz" name="timezone" defaultValue="Africa/Tunis">
            {['Africa/Tunis', 'Europe/Paris', 'Europe/Istanbul', 'Asia/Riyadh', 'UTC'].map((z) => <option key={z}>{z}</option>)}
          </Select>
        </Field>
        <Field label="Source de la date" htmlFor="dl_source" hint="Obligatoire si une date est saisie">
          <LabelSelect labels={deadlineSourceLabels} name="source" id="dl_source" emptyLabel="—" />
        </Field>
        <Field label="Justification" htmlFor="dl_note" hint="E-mail fournisseur, contrat, réponse API…" className="md:col-span-2">
          <Input id="dl_note" name="source_note" />
        </Field>
        <Field label="Responsable de la collecte" htmlFor="dl_assignee" hint="Si la date est à compléter">
          <StaffSelect staff={staff} name="assignee_id" id="dl_assignee" emptyLabel="Responsable du dossier" />
        </Field>
      </div>
      <SubmitButton>Ajouter l’échéance</SubmitButton>
    </ActionForm>
  )
}
