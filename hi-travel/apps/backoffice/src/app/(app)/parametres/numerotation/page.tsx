import { createClient } from '@hi/db/server'
import { Card, Input, Table, Td, Th } from '@hi/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PageHeader } from '@/components/page'
import { SettingsTabs } from '@/components/admin/settings-tabs'
import { requireStaff } from '@/lib/auth'
import { saveNumberSeries } from '../actions'

export const metadata = { title: 'Séries de numérotation' }

export default async function NumberingPage() {
  const session = await requireStaff('settings', 'read')
  const supabase = await createClient()
  const [{ data: series }, { data: counters }] = await Promise.all([
    supabase.from('number_series').select('*').order('code'),
    supabase.from('number_counters').select('code, year, value'),
  ])
  const year = new Date().getFullYear()
  const last = (code: string) => counters?.filter((c) => c.code === code).sort((a, b) => b.year - a.year)[0]
  const canEdit = session.can('settings', 'update')
  const example = (s: { prefix: string; per_year: boolean; padding: number }, n: number) => `${s.prefix}${s.per_year ? `-${year}` : ''}-${String(n).padStart(s.padding, '0')}`

  return (
    <>
      <PageHeader title="Paramètres" description="Séries paramétrables des devis, dossiers, factures, avoirs, pro formas, règlements, bordereaux et journaux. Un numéro attribué n’est jamais réutilisé." />
      <SettingsTabs current="/parametres/numerotation" />
      <Card>
        <Table>
          <thead><tr><Th>Série</Th><Th>Libellé</Th><Th>Préfixe</Th><Th>Chiffres</Th><Th>Par année</Th><Th>Dernier compteur</Th><Th>Prochain numéro</Th>{canEdit ? <Th /> : null}</tr></thead>
          <tbody>
            {(series ?? []).map((s) => {
              const c = last(s.code)
              const next = (c && (!s.per_year || c.year === year) ? c.value : 0) + 1
              return (
                <tr key={s.code}>
                  {canEdit ? (
                    <>
                      <Td className="font-mono text-xs">{s.code}</Td>
                      <Td colSpan={4}>
                        <ActionForm action={saveNumberSeries} className="[&>div]:space-y-0">
                          <input type="hidden" name="code" value={s.code} />
                          <div className="flex flex-wrap items-center gap-2">
                            <Input name="label" defaultValue={s.label} className="w-48" aria-label="Libellé" />
                            <Input name="prefix" defaultValue={s.prefix} className="w-24 font-mono" aria-label="Préfixe" />
                            <Input name="padding" type="number" min={3} max={10} defaultValue={s.padding} className="w-20" aria-label="Chiffres" />
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="per_year" value="1" defaultChecked={s.per_year} /> annuelle</label>
                            <SubmitButton size="sm" variant="secondary" confirm="Modifier cette série ? Les prochains numéros suivront le nouveau format.">OK</SubmitButton>
                          </div>
                        </ActionForm>
                      </Td>
                    </>
                  ) : (
                    <>
                      <Td className="font-mono text-xs">{s.code}</Td><Td>{s.label}</Td><Td className="font-mono">{s.prefix}</Td><Td>{s.padding}</Td><Td>{s.per_year ? 'Oui' : 'Non'}</Td>
                    </>
                  )}
                  <Td className="text-xs">{c ? `${c.value} (${c.year || '—'})` : '—'}</Td>
                  <Td className="font-mono text-xs">{example(s, next)}</Td>
                  {canEdit ? <Td /> : null}
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>
    </>
  )
}
