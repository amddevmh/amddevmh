import { ACTIVITIES, activityLabels, serviceStatusLabels } from '@hi/core'
import { Select } from '@hi/ui'
import { FilterBar } from '@/components/page'
import { FilterField, FilterInput, ResetLink } from './ui'

/** Filtres des listes de prestations (GET : URL partageable). */
export function ServicesFilter({ action, values, suppliers, showModule }: {
  action: string
  values: { statut?: string; fournisseur?: string; q?: string; du?: string; au?: string; activite?: string; revue?: string; expire?: string }
  suppliers: Array<{ id: string; name: string }>
  showModule?: boolean
}) {
  const known = ['requested', 'option', 'confirmed', 'cancelled', 'requested,option']
  return (
    <FilterBar action={action}>
      <FilterField label="Recherche"><FilterInput name="q" defaultValue={values.q} placeholder="Description" /></FilterField>
      {showModule ? (
        <FilterField label="Module">
          <Select name="activite" defaultValue={values.activite ?? ''}>
            <option value="">Tous</option>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
          </Select>
        </FilterField>
      ) : null}
      <FilterField label="Statut">
        <Select name="statut" defaultValue={values.statut ?? ''}>
          <option value="">Tous</option>
          <option value="requested,option">Non confirmées</option>
          {Object.entries(serviceStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          {values.statut && !known.includes(values.statut) ? <option value={values.statut}>{values.statut}</option> : null}
        </Select>
      </FilterField>
      <FilterField label="Fournisseur">
        <Select name="fournisseur" defaultValue={values.fournisseur ?? ''}>
          <option value="">Tous</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </FilterField>
      <FilterField label="Début du"><FilterInput type="date" name="du" defaultValue={values.du} /></FilterField>
      <FilterField label="au"><FilterInput type="date" name="au" defaultValue={values.au} /></FilterField>
      <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="revue" value="1" defaultChecked={values.revue === '1'} className="size-4" /> À revoir</label>
      <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="expire" value="48h" defaultChecked={values.expire === '48h'} className="size-4" /> Options &lt; 48 h</label>
      <ResetLink href={action} />
    </FilterBar>
  )
}
