import Link from 'next/link'
import { computePriority, formatDateTimeFr, priorityLabels, type PriorityLevel } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, CardBody, CardHeader, Field, Input, StatusBadge, Table, Td, Th, buttonClass } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { SettingsTabs } from '@/components/admin/settings-tabs'
import { requireStaff } from '@/lib/auth'
import { sp, type SearchParams } from '@/lib/fin/format'
import { saveThresholds } from '../actions'

export const metadata = { title: 'Seuils d’urgence' }

export default async function ThresholdsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('settings', 'read')
  const params = await searchParams
  const supabase = await createClient()
  const [{ data: setting }, { data: tasks }, { data: history }] = await Promise.all([
    supabase.from('app_settings').select('value, updated_at').eq('key', 'priority_thresholds').maybeSingle(),
    supabase.from('task_board').select('id, title, status, due_at, manual_priority, manual_priority_reason, deadline_id, dossier_start_date, financial_risk, dossier_reference, assignee_name, last_action_at').not('status', 'in', '(done,cancelled)').limit(2000),
    session.can('reports', 'read')
      ? supabase.from('audit_log').select('id, changed, reason, created_at').eq('table_name', 'app_settings').order('created_at', { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as Array<{ id: number; changed: unknown; reason: string | null; created_at: string }> }),
  ])
  const cur = (setting?.value ?? {}) as { red_hours?: number; escalation_hours?: number }
  const curRed = cur.red_hours ?? 4
  const curEsc = cur.escalation_hours ?? 24
  const propRed = Number(sp(params.red_hours) ?? curRed)
  const propEsc = Number(sp(params.escalation_hours) ?? curEsc)
  const previewing = sp(params.red_hours) != null || sp(params.escalation_hours) != null
  const now = new Date()

  // Prévisualisation (DEL03) : même règle que la fonction SQL task_priority, avec le seuil proposé
  const rows = (tasks ?? []).map((t) => {
    const input = {
      status: t.status ?? 'todo', dueAt: t.due_at, manualPriority: (t.manual_priority as PriorityLevel | null) ?? null, manualPriorityReason: t.manual_priority_reason,
      hasExternalDeadlineMissing: !!t.deadline_id, departureDate: t.dossier_start_date, financialRisk: !!t.financial_risk,
    }
    const before = computePriority(input, now, curRed)
    const after = computePriority(input, now, propRed)
    const idleHours = t.last_action_at ? (now.getTime() - new Date(t.last_action_at).getTime()) / 3_600_000 : null
    return { ...t, before, after, escalBefore: idleHours != null && idleHours > curEsc, escalAfter: idleHours != null && idleHours > propEsc }
  })
  const levels: PriorityLevel[] = ['red', 'orange', 'planned']
  const countBy = (k: 'before' | 'after', l: PriorityLevel) => rows.filter((r) => r[k].level === l).length
  const changed = rows.filter((r) => r.before.level !== r.after.level || r.escalBefore !== r.escalAfter)
  const appSettingHistory = (history ?? []).filter((h) => h.changed && JSON.stringify(h.changed).includes('red_hours'))
  const canEdit = session.can('settings', 'update')

  return (
    <>
      <PageHeader title="Paramètres" description="Seuils du classement des urgences (JOU02). Toute modification se prévisualise sur les tâches ouvertes avant application, puis est historisée avec son motif (DEL03, REC44)." />
      <SettingsTabs current="/parametres/urgences" />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader title="Seuils" description={`En vigueur : rouge si échéance < ${curRed} h ; escalade au suppléant après ${curEsc} h sans action.`} />
          <CardBody>
            <form method="get" className="space-y-3">
              <Field label="Rouge : échéance dans moins de (heures)" htmlFor="red_hours"><Input id="red_hours" name="red_hours" type="number" min={1} max={168} defaultValue={propRed} /></Field>
              <Field label="Escalade sans action après (heures)" htmlFor="escalation_hours"><Input id="escalation_hours" name="escalation_hours" type="number" min={1} max={720} defaultValue={propEsc} /></Field>
              <button type="submit" className={buttonClass('secondary')}>Prévisualiser l’effet</button>
            </form>
            {previewing && canEdit ? (
              <div className="mt-5 border-t border-line pt-4">
                <ActionForm action={saveThresholds}>
                  <input type="hidden" name="red_hours" value={propRed} />
                  <input type="hidden" name="escalation_hours" value={propEsc} />
                  <Field label="Motif du changement" htmlFor="reason" required><Input id="reason" name="reason" required /></Field>
                  <SubmitButton confirm={`Appliquer : rouge < ${propRed} h, escalade après ${propEsc} h ? ${changed.length} tâche(s) changent de classement.`}>Appliquer ces seuils</SubmitButton>
                </ActionForm>
              </div>
            ) : null}
            <p className="mt-4 text-xs text-muted">Une limite fournisseur n’est jamais décalée : le seuil sert à anticiper la préparation.</p>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Effet sur les tâches ouvertes" description={`${rows.length} tâche(s) ouvertes${previewing ? ` — comparaison avec rouge < ${propRed} h, escalade ${propEsc} h` : ''}.`} />
          <CardBody>
            <div className="mb-4 grid grid-cols-3 gap-3 text-center text-sm">
              {levels.map((l) => (
                <div key={l} className="rounded-lg border border-line p-3">
                  <StatusBadge status={l} labels={priorityLabels} />
                  <p className="mt-1 font-display text-xl tabular">{countBy('before', l)}{previewing ? <> → <strong>{countBy('after', l)}</strong></> : null}</p>
                </div>
              ))}
            </div>
            {previewing ? (
              changed.length === 0 ? <Alert tone="info">Aucune tâche ne change de classement ni d’escalade avec ces seuils.</Alert> : (
                <Table>
                  <thead><tr><Th>Tâche</Th><Th>Dossier</Th><Th>Échéance</Th><Th>Actuel</Th><Th>Avec les seuils proposés</Th></tr></thead>
                  <tbody>
                    {changed.map((r) => (
                      <tr key={r.id}>
                        <Td className="text-sm">{r.title}<span className="block text-xs text-muted">{r.assignee_name ?? 'sans responsable'}</span></Td>
                        <Td className="text-xs">{r.dossier_reference ?? '—'}</Td>
                        <Td className="text-xs">{formatDateTimeFr(r.due_at)}</Td>
                        <Td><StatusBadge status={r.before.level} labels={priorityLabels} /><span className="block text-[11px] text-muted">{r.before.reason}</span>{r.escalBefore ? <Badge tone="danger" className="mt-1">escalade</Badge> : null}</Td>
                        <Td><StatusBadge status={r.after.level} labels={priorityLabels} /><span className="block text-[11px] text-muted">{r.after.reason}</span>{r.escalAfter ? <Badge tone="danger" className="mt-1">escalade</Badge> : null}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )
            ) : <p className="text-sm text-muted">Saisissez de nouveaux seuils puis « Prévisualiser l’effet ».</p>}
            {session.can('tasks', 'read') ? <p className="mt-3 text-xs"><Link className="text-brand-600 hover:underline" href="/taches">Voir les tâches</Link></p> : null}
          </CardBody>
        </Card>
      </div>
      {appSettingHistory.length ? (
        <Card className="mt-5">
          <CardHeader title="Historique des seuils" />
          <CardBody>
            <ul className="space-y-1 text-xs">
              {appSettingHistory.map((h) => {
                const c = (h.changed as { value?: { old?: { red_hours?: number; escalation_hours?: number }; new?: { red_hours?: number; escalation_hours?: number } } })?.value
                return <li key={h.id}><span className="text-muted">{formatDateTimeFr(h.created_at)}</span> — rouge {c?.old?.red_hours} h → {c?.new?.red_hours} h, escalade {c?.old?.escalation_hours} h → {c?.new?.escalation_hours} h{h.reason ? ` — « ${h.reason} »` : ''}</li>
              })}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </>
  )
}
