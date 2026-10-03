import { formatMoney } from '@hi/core'
import { createClient } from '@hi/db/server'
import { Alert, Badge, Card, CardBody, CardHeader, DateText, Field, Input, Select, Table, Td, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { SettingsTabs } from '@/components/admin/settings-tabs'
import { requireStaff } from '@/lib/auth'
import { todayTunis } from '@/lib/fin/format'
import { saveTaxRule, updateTaxRule } from '../actions'

export const metadata = { title: 'Règles fiscales' }

const KINDS: Record<string, string> = { vat: 'TVA', stamp: 'Timbre', withholding: 'Retenue à la source' }

export default async function TaxRulesPage() {
  const session = await requireStaff('settings', 'read')
  const supabase = await createClient()
  const { data: rules } = await supabase.from('tax_rules').select('*').order('code').order('effective_from', { ascending: false })
  const today = todayTunis()
  const canEdit = session.can('settings', 'update') && session.can('accounting', 'validate')

  return (
    <>
      <PageHeader title="Paramètres" description="Taxes, timbre et retenues par date d’effet (FIN08). Aucun taux n’est figé dans le code ; les règles doivent être confirmées par le comptable avant mise en service." />
      <SettingsTabs current="/parametres/fiscalite" />
      {(rules ?? []).some((r) => !r.validated_by_accountant) ? <Alert tone="warning" className="mb-4">Des règles ne sont pas encore validées par le comptable : elles sont signalées « à valider » sur les factures et pièces.</Alert> : null}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table>
            <thead><tr><Th>Code</Th><Th>Libellé</Th><Th>Nature</Th><Th className="text-right">Taux / montant</Th><Th>Effet</Th><Th>Validation</Th>{canEdit ? <Th /> : null}</tr></thead>
            <tbody>
              {(rules ?? []).map((r) => {
                const current = r.effective_from <= today && (!r.effective_to || r.effective_to >= today)
                return (
                  <tr key={r.id} className={current ? undefined : 'text-muted'}>
                    <Td className="font-mono text-xs">{r.code}</Td>
                    <Td>{r.label}</Td>
                    <Td className="text-xs">{KINDS[r.kind]}</Td>
                    <Td className="text-right tabular">{r.rate != null ? `${(Number(r.rate) * 100).toFixed(2)} %` : formatMoney(r.fixed_amount)}</Td>
                    <Td className="whitespace-nowrap text-xs"><DateText value={r.effective_from} /> → {r.effective_to ? <DateText value={r.effective_to} /> : '…'} {current ? <Badge tone="success">en vigueur</Badge> : null}</Td>
                    <Td>{r.validated_by_accountant ? <Badge tone="success">Validée</Badge> : <Badge tone="warning">À valider</Badge>}</Td>
                    {canEdit ? (
                      <Td>
                        <details>
                          <summary className="cursor-pointer text-xs text-brand-600">Modifier</summary>
                          <ActionForm action={updateTaxRule} className="mt-2 w-56">
                            <input type="hidden" name="id" value={r.id} />
                            <Field label="Fin d’effet"><Input name="effective_to" type="date" defaultValue={r.effective_to ?? ''} /></Field>
                            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="validated_by_accountant" value="1" defaultChecked={r.validated_by_accountant} /> Validée par le comptable</label>
                            <SubmitButton size="sm">Enregistrer</SubmitButton>
                          </ActionForm>
                        </details>
                      </Td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
        {canEdit ? (
          <Card>
            <CardHeader title="Nouvelle règle ou nouveau taux" description="Un changement de taux = nouvelle ligne datée ; l’historique reste applicable aux pièces antérieures." />
            <CardBody>
              <ActionForm action={saveTaxRule} resetOnSuccess>
                <Field label="Code" htmlFor="code" required><Input id="code" name="code" placeholder="VAT_STD" required /></Field>
                <Field label="Libellé" htmlFor="tlabel" required><Input id="tlabel" name="label" required /></Field>
                <Field label="Nature" htmlFor="kind"><Select id="kind" name="kind">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Taux (%)" htmlFor="rate_pct"><Input id="rate_pct" name="rate_pct" inputMode="decimal" /></Field>
                  <Field label="ou montant fixe" htmlFor="fixed_amount"><Input id="fixed_amount" name="fixed_amount" inputMode="decimal" /></Field>
                  <Field label="Effet au" htmlFor="effective_from" required><Input id="effective_from" name="effective_from" type="date" required /></Field>
                  <Field label="Jusqu’au" htmlFor="effective_to"><Input id="effective_to" name="effective_to" type="date" /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="validated_by_accountant" value="1" /> Validée par le comptable</label>
                <SubmitButton>Ajouter</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  )
}
