import { ACTIVITIES, activityLabels, roleLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Card, CardBody, Select, Table, Td, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { SettingsTabs } from '@/components/admin/settings-tabs'
import { requireStaff } from '@/lib/auth'
import { saveAssignmentRules } from '../actions'

export const metadata = { title: 'Affectation des demandes' }

export default async function AssignmentPage() {
  const session = await requireStaff('settings', 'read')
  const supabase = await createClient()
  const [{ data: rules }, { data: staff }] = await Promise.all([
    supabase.from('lead_assignment_rules').select('activity, owner_id'),
    supabase.from('staff_profiles').select('id, full_name, role').eq('active', true).order('full_name'),
  ])
  const owner = new Map((rules ?? []).map((r) => [r.activity, r.owner_id]))
  const canEdit = session.can('settings', 'update')
  return (
    <>
      <PageHeader title="Paramètres" description="Responsable attribué automatiquement aux demandes reçues du site, par activité. Sans responsable, la demande rejoint la file « à attribuer »." />
      <SettingsTabs current="/parametres/affectation" />
      <Card className="max-w-3xl">
        <ActionForm action={saveAssignmentRules}>
          <Table>
            <thead><tr><Th>Activité</Th><Th>Responsable</Th></tr></thead>
            <tbody>
              {ACTIVITIES.map((a) => (
                <tr key={a}>
                  <Td>{activityLabels[a]}</Td>
                  <Td>
                    <Select name={`owner_${a}`} defaultValue={owner.get(a) ?? ''} disabled={!canEdit} aria-label={`Responsable ${activityLabels[a]}`}>
                      <option value="">— File à attribuer —</option>
                      {(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name} ({roleLabels[s.role]})</option>)}
                    </Select>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {canEdit ? <CardBody><SubmitButton>Enregistrer</SubmitButton></CardBody> : null}
        </ActionForm>
      </Card>
    </>
  )
}
