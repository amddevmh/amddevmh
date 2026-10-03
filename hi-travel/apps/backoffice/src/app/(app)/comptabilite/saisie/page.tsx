import { createClient } from '@hi/db/server'
import { Alert, Card, CardBody } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { AccountingTabs } from '@/components/fin/accounting-tabs'
import { EntryForm } from '@/components/fin/entry-form'
import { requireStaff } from '@/lib/auth'
import { isUuid, sp, todayTunis, type SearchParams } from '@/lib/fin/format'
import { deleteDraftEntry, saveManualEntry } from '../actions'

export const metadata = { title: 'Saisie comptable' }

export default async function ManualEntryPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaff('accounting', 'create')
  const params = await searchParams
  const entryId = sp(params.entry)
  const supabase = await createClient()
  const [{ data: journals }, { data: accounts }] = await Promise.all([
    supabase.from('journals').select('code, label').order('code'),
    supabase.from('accounts').select('code, label, allow_posting, active').order('code'),
  ])
  let initial: Parameters<typeof EntryForm>[0]['initial']
  let posted = false
  if (isUuid(entryId)) {
    const { data: e } = await supabase.from('journal_entries').select('id, journal_code, entry_date, piece_ref, label, status, journal_lines(account_code, label, debit, credit)').eq('id', entryId).maybeSingle()
    if (e) {
      posted = e.status === 'posted'
      initial = {
        id: e.id, journal_code: e.journal_code, entry_date: e.entry_date, piece_ref: e.piece_ref ?? '', label: e.label,
        lines: e.journal_lines.map((l) => ({
          account_code: l.account_code, label: l.label ?? '',
          debit: Number(l.debit) ? String(Number(l.debit)) : '', credit: Number(l.credit) ? String(Number(l.credit)) : '',
        })),
      }
    }
  }
  return (
    <>
      <PageHeader title="Comptabilité" description="Saisie manuelle d’opérations diverses, enregistrée en brouillard puis validée de manière atomique." />
      <AccountingTabs current="/comptabilite/saisie" />
      {posted ? <Alert tone="warning" className="mb-4">Cette pièce est validée : toute correction passe par une contrepassation (journal).</Alert> : null}
      <Card>
        <CardBody>
          <EntryForm
            action={saveManualEntry}
            journals={journals ?? []}
            accounts={accounts ?? []}
            initial={initial}
            canValidate={session.can('accounting', 'validate')}
            today={todayTunis()}
          />
        </CardBody>
      </Card>
      {initial && !posted && session.can('accounting', 'update') ? (
        <div className="mt-4 flex justify-end">
          <ActionForm action={deleteDraftEntry}>
            <input type="hidden" name="entry_id" value={initial.id} />
            <SubmitButton variant="ghost" confirm="Supprimer cette saisie en brouillard ?">Supprimer le brouillon</SubmitButton>
          </ActionForm>
        </div>
      ) : null}
    </>
  )
}
