import { roleLabels } from '@hi/core'
import { Card, CardBody, CardHeader, DefinitionList, Field, Input } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { requireStaff } from '@/lib/auth'
import { PASSWORD_MIN } from '@/lib/password'
import { changeOwnPassword } from './actions'

export const metadata = { title: 'Mon compte' }

export default async function AccountPage() {
  const session = await requireStaff()
  return (
    <>
      <PageHeader title="Mon compte" description="Vos informations de connexion au back office." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profil" description="Le nom et le rôle sont gérés par la direction (Paramètres → Utilisateurs)." />
          <CardBody>
            <DefinitionList items={[
              ['Nom', session.profile.full_name],
              ['E-mail de connexion', session.email],
              ['Rôle', roleLabels[session.profile.role]],
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Changer mon mot de passe" description="Votre session reste ouverte ; le nouveau mot de passe s’applique à vos prochaines connexions." />
          <CardBody>
            <ActionForm action={changeOwnPassword} resetOnSuccess>
              <Field label="Mot de passe actuel" htmlFor="current_password" required>
                <Input id="current_password" name="current_password" type="password" autoComplete="current-password" required />
              </Field>
              <Field label="Nouveau mot de passe" htmlFor="new_password" required hint={`${PASSWORD_MIN} caractères minimum`}>
                <Input id="new_password" name="new_password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} />
              </Field>
              <Field label="Confirmer le nouveau mot de passe" htmlFor="confirm_password" required>
                <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} />
              </Field>
              <SubmitButton>Changer mon mot de passe</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
