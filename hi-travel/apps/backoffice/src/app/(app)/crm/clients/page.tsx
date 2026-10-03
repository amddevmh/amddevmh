import Link from 'next/link'
import { formatDateFr, label, leadSourceLabels } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, Select, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'
import { clientKindLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Clients' }

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('crm')
  const params = await searchParams
  const q = sp(params, 'q')
  const kind = sp(params, 'type')
  const archived = sp(params, 'archives') === '1'
  const supabase = await db()
  let query = supabase.from('clients').select('id, kind, display_name, email, phone, city, source, created_at, merged_into_id, archived_at')
  if (!archived) query = query.is('merged_into_id', null).is('archived_at', null)
  if (kind) query = query.eq('kind', kind as never)
  if (q) {
    const digits = q.replace(/\D/g, '')
    query = query.or([`display_name.ilike.${ilikeValue(q)}`, `email.ilike.${ilikeValue(q)}`, `tax_id.ilike.${ilikeValue(q)}`, digits.length >= 4 ? `phone.ilike.%${digits.slice(-8)}%` : null].filter(Boolean).join(','))
  }
  const { data: clients, error } = await query.order('display_name').limit(300)

  return (
    <>
      <PageHeader
        title="Clients et entreprises"
        description="Fiches clients, contacts payeurs et voyageurs. Les doublons sont vérifiés avant chaque création."
        breadcrumbs={[{ href: '/crm/demandes', label: 'Clients et entreprises' }]}
        actions={session.can('crm', 'create') ? <Link href="/crm/clients/nouveau" className={buttonClass('accent')}>Nouveau client</Link> : null}
      />
      <FilterBar action="/crm/clients">
        <FilterField label="Recherche"><FilterInput name="q" defaultValue={q} placeholder="Nom, e-mail, téléphone, matricule" className="min-w-64" /></FilterField>
        <FilterField label="Type">
          <Select name="type" defaultValue={kind ?? ''}>
            <option value="">Tous</option>
            {Object.entries(clientKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FilterField>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="archives" value="1" defaultChecked={archived} className="size-4" /> Inclure fusionnés / archivés</label>
        <ResetLink href="/crm/clients" />
      </FilterBar>
      <Card>
        <CardHeader title={`${clients?.length ?? 0} fiche(s)`} description={error ? `Erreur : ${error.message}` : undefined} />
        <CardBody>
          {!clients?.length ? <EmptyState title="Aucun client" description="Aucune fiche ne correspond à la recherche." /> : (
            <Table className="-mx-5">
              <thead><tr><Th>Nom</Th><Th>Type</Th><Th>Coordonnées</Th><Th>Ville</Th><Th>Source</Th><Th>Créé le</Th></tr></thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`/crm/clients/${c.id}`} className="font-medium text-brand-600 hover:underline">{c.display_name}</Link>
                      {c.merged_into_id ? <p><Badge tone="neutral">Fusionné</Badge></p> : null}
                    </Td>
                    <Td>{label(clientKindLabels, c.kind)}</Td>
                    <Td className="text-xs">{c.email}<br />{c.phone}</Td>
                    <Td>{c.city ?? '—'}</Td>
                    <Td>{label(leadSourceLabels, c.source)}</Td>
                    <Td>{formatDateFr(c.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  )
}
