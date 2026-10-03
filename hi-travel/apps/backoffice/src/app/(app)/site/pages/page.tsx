import { publicationStatusLabels } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Card, CardBody, CardHeader, DateText, EmptyState, Field, Input, Select, StatusBadge, Table, Td, Textarea, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader, Tabs } from '@/components/page'
import { requireStaff } from '@/lib/auth'
import { addRedirect, deleteRedirect, saveAgency, savePage } from '../actions'

export const metadata = { title: 'Pages du site' }

interface Agency { name?: string; phone?: string; whatsapp?: string; email?: string; address?: string; hours?: string; socials?: Record<string, string> }

function PageFields({ p, canPublish }: { p?: { slug: string; title: string; body: string; seo_title: string | null; seo_description: string | null; status: string }; canPublish: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Titre" required><Input name="title" defaultValue={p?.title ?? ''} required /></Field>
      <Field label="Adresse (slug)" required><Input name="slug" defaultValue={p?.slug ?? ''} className="font-mono" required /></Field>
      <Field label="Texte" className="md:col-span-2" hint="Les textes légaux doivent être validés par HI Travel avant mise en ligne"><Textarea name="body" rows={8} defaultValue={p?.body ?? ''} /></Field>
      <Field label="Titre SEO"><Input name="seo_title" maxLength={70} defaultValue={p?.seo_title ?? ''} /></Field>
      <Field label="Description SEO"><Input name="seo_description" maxLength={170} defaultValue={p?.seo_description ?? ''} /></Field>
      <Field label="Statut">
        <Select name="status" defaultValue={p?.status ?? 'draft'}>
          {Object.entries(publicationStatusLabels).filter(([k]) => canPublish || k !== 'published' || p?.status === 'published').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
    </div>
  )
}

export default async function SitePagesPage() {
  const session = await requireStaff('site', 'read')
  const supabase = await createClient()
  const [{ data: pages }, { data: redirects }, { data: agencyRow }] = await Promise.all([
    supabase.from('site_pages').select('*').order('slug'),
    supabase.from('site_redirects').select('*').order('created_at', { ascending: false }),
    supabase.from('app_settings').select('value, updated_at').eq('key', 'agency').maybeSingle(),
  ])
  const agency = (agencyRow?.value ?? {}) as Agency
  const canEdit = session.can('site', 'update')
  const canPublish = session.can('site', 'validate')

  return (
    <>
      <PageHeader title="Offres et site internet" description="Pages de présentation et textes légaux, redirections des anciennes adresses et coordonnées publiques de l’agence." />
      <Tabs current="/site/pages" tabs={[{ href: '/site/offres', label: 'Offres' }, { href: '/site/pages', label: 'Pages, redirections et coordonnées' }]} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Pages" />
            {(pages ?? []).length === 0 ? <EmptyState title="Aucune page" /> : (
              <div className="divide-y divide-line">
                {(pages ?? []).map((p) => (
                  <details key={p.id} className="px-5 py-3">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                      <span><span className="font-medium text-brand-900">{p.title}</span> <span className="font-mono text-xs text-muted">/{p.slug}</span></span>
                      <span className="flex items-center gap-2 text-xs text-muted"><StatusBadge status={p.status} labels={publicationStatusLabels} /> modifiée le <DateText value={p.updated_at} /></span>
                    </summary>
                    <div className="mt-3">
                      {canEdit ? (
                        <ActionForm action={savePage}>
                          <input type="hidden" name="id" value={p.id} />
                          <PageFields p={p} canPublish={canPublish} />
                          <SubmitButton size="sm">Enregistrer la page</SubmitButton>
                        </ActionForm>
                      ) : <p className="whitespace-pre-line text-sm">{p.body}</p>}
                    </div>
                  </details>
                ))}
              </div>
            )}
            {canEdit ? (
              <CardBody className="border-t border-line">
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-brand-600">+ Nouvelle page</summary>
                  <div className="mt-3">
                    <ActionForm action={savePage} resetOnSuccess>
                      <PageFields canPublish={canPublish} />
                      <SubmitButton size="sm">Créer la page</SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Redirections" description="Adresses stables : les anciennes pages utiles redirigent vers les nouvelles (FO03)." />
            {(redirects ?? []).length === 0 ? <CardBody><p className="text-sm text-muted">Aucune redirection.</p></CardBody> : (
              <Table>
                <thead><tr><Th>Ancienne adresse</Th><Th>Nouvelle adresse</Th><Th>Type</Th>{canEdit ? <Th /> : null}</tr></thead>
                <tbody>
                  {(redirects ?? []).map((r) => (
                    <tr key={r.from_path}>
                      <Td className="font-mono text-xs">{r.from_path}</Td>
                      <Td className="font-mono text-xs">{r.to_path}</Td>
                      <Td className="text-xs">{r.permanent ? 'Permanente (301)' : 'Temporaire (302)'}</Td>
                      {canEdit ? (
                        <Td>
                          <ActionForm action={deleteRedirect}>
                            <input type="hidden" name="from_path" value={r.from_path} />
                            <SubmitButton size="sm" variant="ghost" confirm="Supprimer cette redirection ?">Supprimer</SubmitButton>
                          </ActionForm>
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {canEdit ? (
              <CardBody className="border-t border-line">
                <ActionForm action={addRedirect} resetOnSuccess>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="De" htmlFor="from_path"><Input id="from_path" name="from_path" placeholder="/ancienne-page" required /></Field>
                    <Field label="Vers" htmlFor="to_path"><Input id="to_path" name="to_path" placeholder="/offres/nouvelle-adresse" required /></Field>
                    <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="permanent" value="1" defaultChecked /> Permanente</label>
                    <div className="flex items-end"><SubmitButton size="sm" variant="secondary">Ajouter</SubmitButton></div>
                  </div>
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>
        </div>

        <Card>
          <CardHeader title="Coordonnées de l’agence" description={'Affichées sur le site (accueil, contact, pied de page). Modification journalisée.'} />
          <CardBody>
            {canEdit ? (
              <ActionForm action={saveAgency}>
                <Field label="Nom" htmlFor="a-name" required><Input id="a-name" name="name" defaultValue={agency.name ?? 'HI Travel'} /></Field>
                <Field label="Téléphone" htmlFor="a-phone" required><Input id="a-phone" name="phone" defaultValue={agency.phone ?? ''} /></Field>
                <Field label="WhatsApp" htmlFor="a-wa" hint="Format international, ex. +21628884488"><Input id="a-wa" name="whatsapp" defaultValue={agency.whatsapp ?? ''} /></Field>
                <Field label="E-mail" htmlFor="a-email" required><Input id="a-email" name="email" type="email" defaultValue={agency.email ?? ''} /></Field>
                <Field label="Adresse" htmlFor="a-address"><Textarea id="a-address" name="address" rows={2} defaultValue={agency.address ?? ''} /></Field>
                <Field label="Horaires" htmlFor="a-hours"><Input id="a-hours" name="hours" defaultValue={agency.hours ?? ''} /></Field>
                <Field label="Facebook" htmlFor="a-fb"><Input id="a-fb" name="facebook" type="url" defaultValue={agency.socials?.facebook ?? ''} /></Field>
                <Field label="Instagram" htmlFor="a-ig"><Input id="a-ig" name="instagram" type="url" defaultValue={agency.socials?.instagram ?? ''} /></Field>
                <Field label="TikTok" htmlFor="a-tt"><Input id="a-tt" name="tiktok" type="url" defaultValue={agency.socials?.tiktok ?? ''} /></Field>
                <SubmitButton>Enregistrer les coordonnées</SubmitButton>
              </ActionForm>
            ) : (
              <dl className="space-y-1 text-sm"><dt className="text-muted">Téléphone</dt><dd>{agency.phone}</dd><dt className="text-muted">E-mail</dt><dd>{agency.email}</dd></dl>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  )
}
