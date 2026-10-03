import { createClient } from '@hi/db/server'
import { Badge, Card, CardBody, CardHeader, Field, Input, Select, Table, Td, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { AccountingTabs } from '@/components/fin/accounting-tabs'
import { requireStaff } from '@/lib/auth'
import { saveAccount, savePostingRule } from '../actions'

export const metadata = { title: 'Plan comptable' }

const TYPES: Record<string, string> = { asset: 'Actif', liability: 'Passif', equity: 'Capitaux', income: 'Produit', expense: 'Charge' }

export default async function ChartPage() {
  const session = await requireStaff('accounting', 'read')
  const supabase = await createClient()
  const [{ data: accounts }, { data: rules }, { data: journals }] = await Promise.all([
    supabase.from('accounts').select('*').order('code'),
    supabase.from('posting_rules').select('*').order('event'),
    supabase.from('journals').select('code, label').order('code'),
  ])
  const canEditAccounts = session.can('accounting', 'update')
  const canEditRules = session.can('accounting', 'validate')

  return (
    <>
      <PageHeader title="Comptabilité" description="Plan de comptes et règles de comptabilisation approuvées : les écritures automatiques en découlent. Valeurs à valider par le comptable de HI Travel." />
      <AccountingTabs current="/comptabilite/plan" />
      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Plan comptable" description={canEditAccounts ? 'Modifiable (droit comptabilité : modifier).' : 'Lecture seule.'} />
          <Table>
            <thead><tr><Th>Compte</Th><Th>Libellé</Th><Th>Type</Th><Th>Auxiliaire</Th><Th>Imputable</Th><Th>Actif</Th></tr></thead>
            <tbody>
              {(accounts ?? []).map((a) => (
                <tr key={a.code}>
                  <Td className="font-mono">{a.code}</Td>
                  <Td>{a.label}</Td>
                  <Td>{TYPES[a.type] ?? a.type}</Td>
                  <Td>{a.is_auxiliary ? 'Oui' : '—'}</Td>
                  <Td>{a.allow_posting ? 'Oui' : <Badge tone="warning">Non</Badge>}</Td>
                  <Td>{a.active ? 'Oui' : <Badge>Inactif</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {canEditAccounts ? (
            <CardBody className="border-t border-line">
              <p className="mb-3 text-sm font-medium text-brand-900">Ajouter ou modifier un compte (même code = modification)</p>
              <ActionForm action={saveAccount} resetOnSuccess>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Code" htmlFor="code" required><Input id="code" name="code" inputMode="numeric" required /></Field>
                  <Field label="Libellé" htmlFor="alabel" required className="md:col-span-2"><Input id="alabel" name="label" required /></Field>
                  <Field label="Type" htmlFor="type">
                    <Select id="type" name="type">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                  <div className="flex flex-wrap items-end gap-4 text-sm md:col-span-2">
                    <label className="flex items-center gap-2"><input type="checkbox" name="is_auxiliary" value="1" /> Auxiliaire</label>
                    <label className="flex items-center gap-2"><input type="checkbox" name="allow_posting" value="1" defaultChecked /> Imputable</label>
                    <label className="flex items-center gap-2"><input type="checkbox" name="active" value="1" defaultChecked /> Actif</label>
                    <SubmitButton size="sm">Enregistrer</SubmitButton>
                  </div>
                </div>
              </ActionForm>
            </CardBody>
          ) : null}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Règles de comptabilisation" description={canEditRules ? 'Modifiables (droit comptabilité : valider). Changements audités.' : 'Lecture seule.'} />
          <div className="divide-y divide-line">
            {(rules ?? []).map((r) => (
              <div key={r.event} className="px-5 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-brand-900">{r.label}</p>
                  <span className="font-mono text-xs text-muted">{r.event}</span>
                </div>
                {canEditRules ? (
                  <ActionForm action={savePostingRule}>
                    <input type="hidden" name="event" value={r.event} />
                    <input type="hidden" name="label" value={r.label} />
                    <div className="grid grid-cols-3 gap-2">
                      <Select aria-label="Journal" name="journal_code" defaultValue={r.journal_code}>{(journals ?? []).map((j) => <option key={j.code} value={j.code}>{j.code}</option>)}</Select>
                      <Select aria-label="Compte débité" name="debit_account" defaultValue={r.debit_account}>{(accounts ?? []).map((a) => <option key={a.code} value={a.code}>D {a.code}</option>)}</Select>
                      <Select aria-label="Compte crédité" name="credit_account" defaultValue={r.credit_account}>{(accounts ?? []).map((a) => <option key={a.code} value={a.code}>C {a.code}</option>)}</Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="validated_by_accountant" value="1" defaultChecked={r.validated_by_accountant} /> Validée par le comptable</label>
                      <SubmitButton size="sm" variant="secondary">Enregistrer</SubmitButton>
                    </div>
                  </ActionForm>
                ) : (
                  <p className="text-sm">
                    <span className="font-mono">{r.journal_code}</span> · Débit <span className="font-mono">{r.debit_account}</span> / Crédit <span className="font-mono">{r.credit_account}</span>{' '}
                    {r.validated_by_accountant ? <Badge tone="success">Validée</Badge> : <Badge tone="warning">À valider par le comptable</Badge>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
