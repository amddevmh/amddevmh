import { formatDateTimeFr, roleLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Card, CardBody, CardHeader, Field, Input } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { SettingsTabs } from '@/components/admin/settings-tabs'
import { requireStaff } from '@/lib/auth'
import { ACTIONS, ACTION_LABELS, MODULES, MODULE_LABELS, ROLES } from '@/lib/admin/permissions'
import { savePermissions } from '../actions'

export const metadata = { title: 'Matrice des droits' }

export default async function RightsPage() {
  const session = await requireStaff('settings', 'read')
  const supabase = await createClient()
  const [{ data: perms }, { data: history }] = await Promise.all([
    supabase.from('role_permissions').select('role, module, action'),
    session.can('reports', 'read')
      ? supabase.from('audit_log').select('id, action, old_values, new_values, reason, created_at').eq('table_name', 'role_permissions').order('created_at', { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as Array<{ id: number; action: string; old_values: unknown; new_values: unknown; reason: string | null; created_at: string }> }),
  ])
  const has = new Set((perms ?? []).map((p) => `${p.role}:${p.module}:${p.action}`))
  const canEdit = session.can('settings', 'update')

  return (
    <>
      <PageHeader title="Paramètres" description="Permissions configurables par rôle, module et action (lire, créer, modifier, exporter, valider, archiver). Chaque changement est vérifié côté serveur et journalisé avec son motif." />
      <SettingsTabs current="/parametres/droits" />
      <ActionForm action={savePermissions}>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-line bg-canvas px-3 py-2 text-left">Module</th>
                  {ROLES.map((r) => <th key={r} colSpan={ACTIONS.length} className="border-b border-l border-line bg-canvas px-2 py-2 text-center font-semibold text-brand-900">{roleLabels[r]}</th>)}
                </tr>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-line bg-canvas" />
                  {ROLES.map((r) => ACTIONS.map((a, i) => (
                    <th key={`${r}${a}`} className={`border-b border-line bg-canvas px-1 py-1 text-[10px] font-medium text-muted ${i === 0 ? 'border-l' : ''}`} title={ACTION_LABELS[a]}>{ACTION_LABELS[a].slice(0, 4)}.</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m} className="hover:bg-canvas/60">
                    <td className="sticky left-0 z-10 border-b border-line bg-white px-3 py-1.5 font-medium">{MODULE_LABELS[m]}</td>
                    {ROLES.map((r) => ACTIONS.map((a, i) => (
                      <td key={`${r}${m}${a}`} className={`border-b border-line text-center ${i === 0 ? 'border-l' : ''}`}>
                        <input
                          type="checkbox"
                          name={`perm:${r}:${m}:${a}`}
                          value="1"
                          defaultChecked={has.has(`${r}:${m}:${a}`)}
                          disabled={!canEdit || (r === 'direction' && m === 'settings')}
                          aria-label={`${roleLabels[r]} — ${MODULE_LABELS[m]} — ${ACTION_LABELS[a]}`}
                        />
                        {/* Garde-fou : la direction conserve l'accès aux paramètres */}
                        {r === 'direction' && m === 'settings' && has.has(`${r}:${m}:${a}`) ? <input type="hidden" name={`perm:${r}:${m}:${a}`} value="1" /> : null}
                      </td>
                    )))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit ? (
            <CardBody className="border-t border-line">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Motif du changement (journal d’audit)" htmlFor="reason" required className="min-w-80 flex-1"><Input id="reason" name="reason" required /></Field>
                <SubmitButton confirm="Appliquer les modifications de droits ? Elles prennent effet immédiatement.">Enregistrer la matrice</SubmitButton>
              </div>
              <p className="mt-2 text-xs text-muted">Le profil « gestion du site » ne doit avoir accès ni aux passeports (identity) ni aux marges (margins). Les accès sont aussi contrôlés en base (RLS).</p>
            </CardBody>
          ) : null}
        </Card>
      </ActionForm>
      {(history ?? []).length ? (
        <Card className="mt-5">
          <CardHeader title="Historique des changements" />
          <CardBody>
            <ul className="space-y-1 text-xs">
              {(history ?? []).map((h) => {
                const v = (h.new_values ?? h.old_values) as { role?: string; module?: string; action?: string } | null
                return <li key={h.id}><span className="text-muted">{formatDateTimeFr(h.created_at)}</span> — {h.action === 'insert' ? 'ajout' : 'retrait'} {v?.role}/{v?.module}/{v?.action}{h.reason ? ` — « ${h.reason} »` : ''}</li>
              })}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </>
  )
}
