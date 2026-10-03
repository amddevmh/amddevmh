import { createClient } from '@hi/db/server'
import { Alert, Card, CardBody, CardHeader, Field, Input } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { SettingsTabs } from '@/components/admin/settings-tabs'
import { requireStaff } from '@/lib/auth'
import { saveChannels } from '../actions'

export const metadata = { title: 'Canaux de communication' }

export default async function ChannelsPage() {
  const session = await requireStaff('settings', 'read')
  const supabase = await createClient()
  const [{ data: setting }, { data: connector }] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'channels').maybeSingle(),
    session.can('integrations', 'read') ? supabase.from('integration_connectors').select('enabled, mode').eq('code', 'messaging').maybeSingle() : Promise.resolve({ data: null }),
  ])
  const v = (setting?.value ?? {}) as { email_auto_send?: boolean; whatsapp_auto_send?: boolean; email_sender?: string; whatsapp_number?: string }
  const canEdit = session.can('settings', 'update')
  return (
    <>
      <PageHeader title="Paramètres" description="Les envois automatiques par e-mail ou WhatsApp restent désactivés tant que les canaux, autorisations et règles d’envoi ne sont pas configurés (section 7). Un lien WhatsApp ne constitue pas une synchronisation." />
      <SettingsTabs current="/parametres/canaux" />
      <Card className="max-w-2xl">
        <CardHeader title="Envois automatiques" description={connector ? `Connecteur messagerie : ${connector.enabled ? 'activé' : 'désactivé'} (mode ${connector.mode}).` : undefined} />
        <CardBody>
          {!v.email_auto_send && !v.whatsapp_auto_send ? <Alert tone="info" className="mb-4">Aucun envoi automatique : les messages sont préparés en brouillon et relus avant envoi manuel.</Alert> : null}
          <ActionForm action={saveChannels}>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email_auto_send" value="1" defaultChecked={!!v.email_auto_send} disabled={!canEdit} /> Autoriser l’envoi automatique d’e-mails</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whatsapp_auto_send" value="1" defaultChecked={!!v.whatsapp_auto_send} disabled={!canEdit} /> Autoriser l’envoi automatique WhatsApp (API Business configurée)</label>
            <Field label="Expéditeur e-mail" htmlFor="email_sender"><Input id="email_sender" name="email_sender" type="email" defaultValue={v.email_sender ?? ''} disabled={!canEdit} /></Field>
            <Field label="Numéro WhatsApp Business" htmlFor="whatsapp_number"><Input id="whatsapp_number" name="whatsapp_number" defaultValue={v.whatsapp_number ?? ''} disabled={!canEdit} /></Field>
            <Field label="Motif du changement" htmlFor="reason"><Input id="reason" name="reason" disabled={!canEdit} /></Field>
            {canEdit ? <SubmitButton confirm="Modifier les règles d’envoi ? L’activation d’un envoi automatique engage HI Travel vis-à-vis des clients.">Enregistrer</SubmitButton> : null}
          </ActionForm>
        </CardBody>
      </Card>
    </>
  )
}
