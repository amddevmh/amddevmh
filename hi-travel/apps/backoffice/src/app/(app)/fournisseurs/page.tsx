import Link from 'next/link'
import { label } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, Select, Table, Td, Th, buttonClass } from '@hi/ui'
import { FilterBar, PageHeader } from '@/components/page'
import { FilterField, FilterInput, ResetLink } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, ilikeValue, sp, type SearchParams } from '@/lib/ops/data'
import { supplierKindLabels } from '@/lib/ops/labels'

export const metadata = { title: 'Fournisseurs' }

export default async function SuppliersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('suppliers')
  const params = await searchParams
  const q = sp(params, 'q')
  const kind = sp(params, 'type')
  const inactive = sp(params, 'inactifs') === '1'
  const supabase = await db()
  let query = supabase.from('suppliers').select('id, name, kind, country, city, currency, email, phone, destinations, withholding_applicable, active')
  if (!inactive) query = query.eq('active', true)
  if (kind) query = query.eq('kind', kind as never)
  if (q) query = query.or(`name.ilike.${ilikeValue(q)},email.ilike.${ilikeValue(q)},city.ilike.${ilikeValue(q)}`)
  const [{ data, error }, { data: contracts }] = await Promise.all([
    query.order('name').limit(300),
    supabase.from('supplier_contracts').select('supplier_id, valid_to'),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const activeContracts = new Map<string, number>()
  for (const c of contracts ?? []) if (!c.valid_to || c.valid_to >= today) activeContracts.set(c.supplier_id, (activeContracts.get(c.supplier_id) ?? 0) + 1)
  return (
    <>
      <PageHeader
        title="Fournisseurs"
        description="Contacts, destinations, devises, conditions, contrats et tarifs datés. Les pièces fournisseurs sont gérées par la finance."
        actions={session.can('suppliers', 'create') ? <Link href="/fournisseurs/nouveau" className={buttonClass('accent')}>Nouveau fournisseur</Link> : null}
      />
      <FilterBar action="/fournisseurs">
        <FilterField label="Recherche"><FilterInput name="q" defaultValue={q} placeholder="Nom, e-mail, ville" /></FilterField>
        <FilterField label="Type">
          <Select name="type" defaultValue={kind ?? ''}><option value="">Tous</option>{Object.entries(supplierKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </FilterField>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="inactifs" value="1" defaultChecked={inactive} className="size-4" /> Inclure les inactifs</label>
        <ResetLink href="/fournisseurs" />
      </FilterBar>
      <Card>
        <CardHeader title={`${data?.length ?? 0} fournisseur(s)`} description={error ? `Erreur : ${error.message}` : undefined} />
        <CardBody>
          {!data?.length ? <EmptyState title="Aucun fournisseur" /> : (
            <Table className="-mx-5">
              <thead><tr><Th>Fournisseur</Th><Th>Type</Th><Th>Localisation</Th><Th>Devise</Th><Th>Destinations</Th><Th>Contrats en cours</Th></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className={s.active ? undefined : 'opacity-60'}>
                    <Td><Link href={`/fournisseurs/${s.id}`} className="font-medium text-brand-600 hover:underline">{s.name}</Link><p className="text-xs text-muted">{[s.email, s.phone].filter(Boolean).join(' · ')}</p></Td>
                    <Td>{label(supplierKindLabels, s.kind)}{s.withholding_applicable ? <p><Badge tone="info">Retenue à la source</Badge></p> : null}</Td>
                    <Td>{[s.city, s.country].filter(Boolean).join(', ')}</Td>
                    <Td>{s.currency}</Td>
                    <Td className="text-xs">{s.destinations.join(', ') || '—'}</Td>
                    <Td>{activeContracts.get(s.id) ?? 0}</Td>
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
