import { Card, CardBody } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { ClientCreateForm, type ClientDefaults } from '@/components/ops/client-form'
import { requireStaff } from '@/lib/auth'
import { db, sp, type SearchParams } from '@/lib/ops/data'

export const metadata = { title: 'Nouveau client' }

export default async function NewClientPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff('crm', 'create')
  const params = await searchParams
  const leadId = sp(params, 'demande')
  let defaults: ClientDefaults | undefined
  if (leadId) {
    const supabase = await db()
    const { data: lead } = await supabase.from('leads').select('id, contact_snapshot, source, activity, processing_consent, marketing_consent').eq('id', leadId).maybeSingle()
    if (lead) {
      const c = (lead.contact_snapshot ?? {}) as Record<string, string | null>
      defaults = {
        kind: c.company && lead.activity === 'mice' ? 'company' : 'person',
        first_name: c.first_name, last_name: c.last_name, company_name: c.company,
        email: c.email, phone: c.phone, source: lead.source, lead_id: lead.id,
        consent_processing: lead.processing_consent, consent_marketing: lead.marketing_consent,
      }
    }
  }
  return (
    <>
      <PageHeader
        title="Nouveau client"
        description="La recherche de doublons (e-mail, téléphone, nom) est faite avant la création ; une correspondance exige votre confirmation."
        breadcrumbs={[{ href: '/crm/clients', label: 'Clients' }]}
      />
      <Card><CardBody><ClientCreateForm defaults={defaults} /></CardBody></Card>
    </>
  )
}
