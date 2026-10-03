import { roleLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Badge, Card, CardBody, CardHeader, DateText, Field, Input, Select, Table, Td, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { SettingsTabs } from '@/components/admin/settings-tabs'
import { requireStaff } from '@/lib/auth'
import { ROLES } from '@/lib/admin/permissions'
import { createStaffUser, updateStaff } from './actions'

export const metadata = { title: 'Paramètres — utilisateurs' }

export default async function UsersPage() {
  const session = await requireStaff('settings', 'read')
  const supabase = await createClient()
  const { data: staff } = await supabase.from('staff_profiles').select('*').order('active', { ascending: false }).order('full_name')
  const people = staff ?? []
  const name = new Map(people.map((s) => [s.id, s.full_name]))
  const canEdit = session.can('settings', 'update')

  return (
    <>
      <PageHeader title="Paramètres" description="Comptes individuels, rôles, suppléants et droits. Réservé à la direction." />
      <SettingsTabs current="/parametres" />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Collaborateurs" description="Un compte désactivé ne peut plus se connecter ; ses sessions sont révoquées. L’historique est conservé." />
          <Table>
            <thead><tr><Th>Collaborateur</Th><Th>Rôle</Th><Th>Suppléant</Th><Th>Statut</Th><Th>Créé le</Th>{canEdit ? <Th>Modifier</Th> : null}</tr></thead>
            <tbody>
              {people.map((s) => (
                <tr key={s.id} className={s.active ? undefined : 'opacity-60'}>
                  <Td><span className="font-medium">{s.full_name}</span><span className="block text-xs text-muted">{s.email}</span></Td>
                  <Td>{roleLabels[s.role]}</Td>
                  <Td className="text-sm">{s.backup_id ? name.get(s.backup_id) : '—'}</Td>
                  <Td>{s.active ? <Badge tone="success">Actif</Badge> : <Badge>Désactivé</Badge>}{s.id === session.userId ? <Badge tone="brand" className="ml-1">vous</Badge> : null}</Td>
                  <Td><DateText value={s.created_at} /></Td>
                  {canEdit ? (
                    <Td>
                      <details>
                        <summary className="cursor-pointer text-xs text-brand-600">Modifier</summary>
                        <ActionForm action={updateStaff} className="mt-2 w-64">
                          <input type="hidden" name="id" value={s.id} />
                          <Field label="Rôle"><Select name="role" defaultValue={s.role}>{ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}</Select></Field>
                          <Field label="Suppléant">
                            <Select name="backup_id" defaultValue={s.backup_id ?? ''}>
                              <option value="">Aucun</option>
                              {people.filter((p) => p.id !== s.id && p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                            </Select>
                          </Field>
                          <Field label="Statut"><Select name="active" defaultValue={s.active ? '1' : '0'}><option value="1">Actif</option><option value="0">Désactivé</option></Select></Field>
                          <SubmitButton size="sm" confirm="Appliquer ces changements au compte ?">Enregistrer</SubmitButton>
                        </ActionForm>
                      </details>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {canEdit ? (
          <Card>
            <CardHeader title="Nouveau collaborateur" />
            <CardBody>
              <ActionForm action={createStaffUser} resetOnSuccess>
                <Field label="Nom complet" htmlFor="full_name" required><Input id="full_name" name="full_name" required /></Field>
                <Field label="E-mail" htmlFor="email" required><Input id="email" name="email" type="email" required /></Field>
                <Field label="Rôle" htmlFor="role"><Select id="role" name="role" defaultValue="commercial">{ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}</Select></Field>
                <Field label="Suppléant" htmlFor="backup_id">
                  <Select id="backup_id" name="backup_id" defaultValue=""><option value="">Aucun</option>{people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
                </Field>
                <Field label="Mot de passe initial" htmlFor="password" required hint="12 caractères minimum ; à changer à la première connexion"><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} /></Field>
                <SubmitButton>Créer le compte</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  )
}
