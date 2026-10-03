import { checkStatusLabels, formatDateTimeFr, label } from '@hi/core'
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Input, Money, Select } from '@hi/ui'
import { OpsForm, OpsSubmit } from '@/components/ops/ops-form'
import { StaffSelect } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { generateChecklist, updateCheck } from '@/lib/ops/actions/dossiers'
import { db, getStaff } from '@/lib/ops/data'
import { getDossier } from '@/lib/ops/dossier'

export const metadata = { title: 'Dossier — contrôle avant départ' }

type Check = { id: string; code: string; label: string; status: string; owner_id: string | null; proof_document_id: string | null; note: string | null; updated_at: string; category: string }

export default async function ChecklistTab({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff('dossiers')
  const { id } = await params
  const d = await getDossier(id)
  const supabase = await db()
  const [{ data: checks }, staff, { data: fin }, { data: docs }] = await Promise.all([
    supabase.from('dossier_checks').select('*').eq('dossier_id', id).order('category').order('code'),
    getStaff(),
    supabase.from('dossier_financials').select('sale_net, paid, balance, overdue, scheduled').eq('dossier_id', id).maybeSingle(),
    session.can('documents') ? supabase.from('documents').select('id, title').eq('dossier_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ])
  const canUpdate = session.can('dossiers', 'update')
  const all = (checks ?? []) as Check[]
  const ops = all.filter((c) => c.category === 'operations')
  const finance = all.filter((c) => c.category === 'finance')
  const names = new Map(staff.map((s) => [s.id, s.full_name]))
  const docTitles = new Map((docs ?? []).map((x) => [x.id, x.title]))
  const count = (list: Check[], st: string) => list.filter((c) => c.status === st).length
  const opsReady = ops.length > 0 && ops.every((c) => c.status === 'ok' || c.status === 'na')
  const overdue = Number(fin?.overdue ?? 0)
  const balance = Number(fin?.balance ?? 0)

  const renderList = (list: Check[]) => (
    list.length ? (
      <ul className="divide-y divide-line">
        {list.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{c.label}</p>
                <p className="text-xs text-muted">
                  Responsable : {c.owner_id ? names.get(c.owner_id) : 'à désigner'} · Justificatif : {c.proof_document_id ? <a className="text-brand-600 hover:underline" href={`/api/documents/${c.proof_document_id}`}>{docTitles.get(c.proof_document_id) ?? 'document'}</a> : '—'} · màj {formatDateTimeFr(c.updated_at)}
                </p>
                {c.note ? <p className="text-xs text-brand-700">{c.note}</p> : null}
              </div>
              <Badge tone={c.status === 'ok' ? 'success' : c.status === 'blocking' ? 'danger' : c.status === 'na' ? 'neutral' : 'warning'}>{label(checkStatusLabels, c.status)}</Badge>
            </div>
            {canUpdate ? (
              <OpsForm action={updateCheck} inline className="mt-2">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[10rem_12rem_14rem_1fr_auto]">
                  <Select name="status" defaultValue={c.status} className="h-8! text-xs!" aria-label="Statut">{Object.entries(checkStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  <StaffSelect staff={staff} name="owner_id" id={`own-${c.id}`} defaultValue={c.owner_id} emptyLabel="Responsable…" />
                  <Select name="proof_document_id" defaultValue={c.proof_document_id ?? ''} className="h-8! text-xs!" aria-label="Justificatif">
                    <option value="">— Justificatif —</option>{(docs ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                  </Select>
                  <Input name="note" defaultValue={c.note ?? ''} placeholder="Note (obligatoire si non applicable)" className="h-8! text-xs!" aria-label="Note" />
                  <OpsSubmit size="sm" variant="secondary" pendingLabel="…">Enregistrer</OpsSubmit>
                </div>
              </OpsForm>
            ) : null}
          </li>
        ))}
      </ul>
    ) : <EmptyState title="Aucun contrôle" />
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Checklist par type de voyage et prestation (Conforme, À compléter, Bloquant, Non applicable). Une dérogation ne remplace jamais un document obligatoire ; le statut interne ne garantit pas l’admission sur un territoire.</p>
        {canUpdate ? (
          <OpsForm action={generateChecklist} inline>
            <input type="hidden" name="dossier_id" value={id} />
            <OpsSubmit variant="secondary" size="sm">{all.length ? 'Compléter la checklist (nouvelles prestations)' : 'Générer la checklist'}</OpsSubmit>
          </OpsForm>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Préparation opérationnelle"
            description={`${count(ops, 'ok')} conforme(s) · ${count(ops, 'to_complete')} à compléter · ${count(ops, 'blocking')} bloquant(s) · ${count(ops, 'na')} N/A`}
            actions={<Badge tone={opsReady ? 'success' : count(ops, 'blocking') ? 'danger' : 'warning'}>{opsReady ? 'Prêt pour le départ' : count(ops, 'blocking') ? 'Bloqué' : 'À compléter'}</Badge>}
          />
          <CardBody>{renderList(ops)}</CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Situation financière"
            description="Affichée séparément : un paiement complet ne prouve pas que le voyage est prêt."
            actions={<Badge tone={overdue > 0 ? 'danger' : balance > 0 ? 'info' : 'success'}>{overdue > 0 ? 'Retard de paiement' : balance > 0 ? 'Conforme à l’échéancier' : 'Soldé'}</Badge>}
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-muted">Encaissé</p><Money value={fin?.paid ?? 0} /></div>
              <div><p className="text-xs text-muted">Solde</p><Money value={balance} /></div>
              <div><p className="text-xs text-muted">Échu non payé</p><Money value={overdue} className={overdue > 0 ? 'font-semibold text-danger-700' : ''} /></div>
            </div>
            {balance > 0 && overdue === 0 ? <Alert tone="info">Solde futur autorisé par l’échéancier : ne bloque pas automatiquement le départ.</Alert> : null}
            {renderList(finance)}
          </CardBody>
        </Card>
      </div>
      {d.status === 'confirmed' && !opsReady ? <Alert tone="warning">Dossier confirmé mais préparation opérationnelle incomplète.</Alert> : null}
    </div>
  )
}
