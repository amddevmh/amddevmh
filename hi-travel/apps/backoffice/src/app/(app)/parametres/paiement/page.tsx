import { createClient } from '@hi/db/server'
import { Card, CardBody, CardHeader, Field, Select, Textarea } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { SettingsTabs } from '@/components/admin/settings-tabs'
import { requireStaff } from '@/lib/auth'
import { saveOnlinePayment } from '../actions'

export const metadata = { title: 'Paiement en ligne' }

export default async function OnlinePaymentPage() {
  const session = await requireStaff('settings', 'read')
  const supabase = await createClient()
  const [{ data: settings }, { data: accounts }] = await Promise.all([
    supabase.from('app_settings').select('key, value').in('key', ['online_payment', 'online_payment_account']),
    session.can('finance', 'read') ? supabase.from('treasury_accounts').select('id, name, kind').eq('active', true).order('name') : Promise.resolve({ data: [] as Array<{ id: string; name: string; kind: string }> }),
  ])
  const op = (settings?.find((s) => s.key === 'online_payment')?.value ?? {}) as { enabled?: boolean; provider?: string; manual_instructions?: string }
  const acc = (settings?.find((s) => s.key === 'online_payment_account')?.value ?? {}) as { treasury_account_id?: string }
  const canEdit = session.can('settings', 'update')
  return (
    <>
      <PageHeader title="Paramètres" description="Paiement en ligne de l’espace client (FO07). Un paiement est confirmé uniquement par la notification serveur signée du prestataire ; il crédite le compte de trésorerie choisi." />
      <SettingsTabs current="/parametres/paiement" />
      <Card className="max-w-2xl">
        <CardHeader title="Prestataire et compte crédité" description={`Prestataire : ${op.provider ?? '—'} (simulé). Identifiants et secret de signature : variables d’environnement du serveur uniquement.`} />
        <CardBody>
          <ActionForm action={saveOnlinePayment}>
            <Field label="Paiement en ligne" htmlFor="enabled">
              <Select id="enabled" name="enabled" defaultValue={op.enabled ? '1' : '0'} disabled={!canEdit}><option value="1">Proposé aux clients</option><option value="0">Désactivé (instructions manuelles)</option></Select>
            </Field>
            <Field label="Compte de trésorerie crédité" htmlFor="treasury_account_id" required>
              <Select id="treasury_account_id" name="treasury_account_id" defaultValue={acc.treasury_account_id ?? ''} disabled={!canEdit}>
                <option value="">— Choisir —</option>
                {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Instructions si paiement en ligne indisponible" htmlFor="manual_instructions"><Textarea id="manual_instructions" name="manual_instructions" rows={3} defaultValue={op.manual_instructions ?? ''} disabled={!canEdit} /></Field>
            {canEdit ? <SubmitButton>Enregistrer</SubmitButton> : null}
          </ActionForm>
        </CardBody>
      </Card>
    </>
  )
}
