import Link from 'next/link'
import { formatDateFr } from '@hi/core'
import { Badge, Select, buttonClass, cn } from '@hi/ui'
import { FilterBar } from '@/components/page'
import { FilterField } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db, getStaff, sp, type SearchParams } from '@/lib/ops/data'
import { AGENCY_TZ, addDaysIso, formatInZone, isoToZonedLocal, mondayOf, todayIso, zonedLocalToIso } from '@/lib/ops/format'

export const metadata = { title: 'Calendrier' }

type Kind = 'departure' | 'return' | 'group' | 'visa' | 'transfer' | 'task' | 'deadline'
interface Item { day: string; time?: string; kind: Kind; title: string; sub?: string; href: string; owner?: string | null; warn?: boolean }

const KIND: Record<Kind, { label: string; cls: string }> = {
  departure: { label: 'Départ', cls: 'border-l-brand-500 bg-brand-50' },
  return: { label: 'Retour', cls: 'border-l-brand-300 bg-white' },
  group: { label: 'Départ groupe', cls: 'border-l-brand-900 bg-brand-50' },
  visa: { label: 'Rendez-vous visa', cls: 'border-l-info-600 bg-info-50' },
  transfer: { label: 'Transfert', cls: 'border-l-accent-400 bg-accent-50' },
  task: { label: 'Tâche', cls: 'border-l-muted bg-white' },
  deadline: { label: 'Échéance externe', cls: 'border-l-danger-600 bg-danger-50' },
}

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff('tasks')
  const params = await searchParams
  const week = mondayOf(sp(params, 'semaine') ?? todayIso())
  const end = addDaysIso(week, 7)
  const owner = sp(params, 'responsable')
  const fromTs = zonedLocalToIso(`${week}T00:00`)!
  const toTs = zonedLocalToIso(`${end}T00:00`)!
  const supabase = await db()
  const staff = await getStaff()
  const names = new Map(staff.map((s) => [s.id, s.full_name]))

  const [dossiers, groups, visas, transfers, tasks, deadlines] = await Promise.all([
    supabase.from('dossiers').select('id, reference, title, start_date, end_date, owner_id, status')
      .not('status', 'in', '(cancelled,archived)')
      .or(`and(start_date.gte.${week},start_date.lt.${end}),and(end_date.gte.${week},end_date.lt.${end})`),
    supabase.from('departures').select('id, code, start_date, capacity, seats_confirmed, offers(title)').gte('start_date', week).lt('start_date', end).neq('status', 'cancelled'),
    supabase.from('visa_applications').select('id, appointment_at, destination, status, services(id, dossier_id, description, dossiers(reference, owner_id))')
      .gte('appointment_at', fromTs).lt('appointment_at', toTs),
    supabase.from('services').select('id, description, start_at, start_date, local_timezone, status, dossier_id, details, dossiers(reference, owner_id, status)')
      .in('service_type', ['transfer', 'transport']).neq('status', 'cancelled')
      .or(`and(start_at.gte.${fromTs},start_at.lt.${toTs}),and(start_at.is.null,start_date.gte.${week},start_date.lt.${end})`),
    supabase.from('task_board').select('id, title, due_at, assignee_id, dossier_id, dossier_reference, priority, status')
      .gte('due_at', fromTs).lt('due_at', toTs).not('status', 'in', '(done,cancelled)'),
    supabase.from('external_deadlines').select('id, label, due_at, timezone, dossier_id, status, dossiers(reference, owner_id)')
      .gte('due_at', fromTs).lt('due_at', toTs).eq('status', 'open'),
  ])

  const items: Item[] = []
  const tunisDay = (iso: string) => isoToZonedLocal(iso, AGENCY_TZ).slice(0, 10)
  const tunisTime = (iso: string) => isoToZonedLocal(iso, AGENCY_TZ).slice(11, 16)
  for (const d of dossiers.data ?? []) {
    if (d.start_date && d.start_date >= week && d.start_date < end) items.push({ day: d.start_date, kind: 'departure', title: d.reference, sub: d.title, href: `/dossiers/${d.id}`, owner: d.owner_id })
    if (d.end_date && d.end_date >= week && d.end_date < end) items.push({ day: d.end_date, kind: 'return', title: d.reference, sub: d.title, href: `/dossiers/${d.id}`, owner: d.owner_id })
  }
  for (const g of groups.data ?? []) {
    items.push({ day: g.start_date, kind: 'group', title: g.code, sub: `${(g.offers as { title?: string } | null)?.title ?? ''} — ${g.seats_confirmed}/${g.capacity} confirmées`, href: `/departs/${g.id}` })
  }
  for (const v of visas.data ?? []) {
    const s = v.services as { dossier_id?: string; description?: string; dossiers?: { reference?: string; owner_id?: string | null } | null } | null
    if (!v.appointment_at) continue
    items.push({ day: tunisDay(v.appointment_at), time: tunisTime(v.appointment_at), kind: 'visa', title: `Visa ${v.destination}`, sub: s?.dossiers?.reference, href: `/dossiers/${s?.dossier_id}/prestations`, owner: s?.dossiers?.owner_id })
  }
  for (const t of transfers.data ?? []) {
    const dd = t.dossiers as { reference?: string; owner_id?: string | null; status?: string } | null
    if (dd?.status === 'cancelled') continue
    const day = t.start_at ? isoToZonedLocal(t.start_at, AGENCY_TZ).slice(0, 10) : t.start_date
    if (!day) continue
    items.push({ day, time: t.start_at ? formatInZone(t.start_at, t.local_timezone).slice(11) : undefined, kind: 'transfer', title: t.description, sub: `${dd?.reference ?? ''}${t.status !== 'confirmed' ? ' — non confirmé' : ''}`, href: `/dossiers/${t.dossier_id}/prestations/${t.id}`, owner: dd?.owner_id, warn: t.status !== 'confirmed' })
  }
  for (const t of tasks.data ?? []) {
    if (!t.due_at) continue
    items.push({ day: tunisDay(t.due_at), time: tunisTime(t.due_at), kind: 'task', title: t.title ?? '', sub: [t.dossier_reference, names.get(t.assignee_id ?? '') ?? 'Non attribuée'].filter(Boolean).join(' — '), href: t.dossier_id ? `/dossiers/${t.dossier_id}/taches` : '/taches', owner: t.assignee_id, warn: t.priority === 'red' })
  }
  for (const d of deadlines.data ?? []) {
    if (!d.due_at) continue
    const dd = d.dossiers as { reference?: string; owner_id?: string | null } | null
    items.push({ day: tunisDay(d.due_at), time: tunisTime(d.due_at), kind: 'deadline', title: d.label, sub: dd?.reference, href: `/dossiers/${d.dossier_id}/echeances`, owner: dd?.owner_id, warn: true })
  }
  const visible = owner ? items.filter((i) => i.owner === owner || (owner === 'aucun' && !i.owner && i.kind === 'task')) : items
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(week, i))
  const today = todayIso()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link className={buttonClass('secondary', 'sm')} href={`/taches/calendrier?semaine=${addDaysIso(week, -7)}${owner ? `&responsable=${owner}` : ''}`}>← Semaine précédente</Link>
          <Link className={buttonClass('ghost', 'sm')} href={`/taches/calendrier${owner ? `?responsable=${owner}` : ''}`}>Cette semaine</Link>
          <Link className={buttonClass('secondary', 'sm')} href={`/taches/calendrier?semaine=${addDaysIso(week, 7)}${owner ? `&responsable=${owner}` : ''}`}>Semaine suivante →</Link>
        </div>
        <p className="text-sm font-medium text-brand-900">Semaine du {formatDateFr(week)} au {formatDateFr(addDaysIso(week, 6))}</p>
      </div>
      <FilterBar action="/taches/calendrier">
        <input type="hidden" name="semaine" value={week} />
        <FilterField label="Responsable">
          <Select name="responsable" defaultValue={owner ?? ''}>
            <option value="">Toute l’équipe</option>
            <option value="aucun">Tâches non attribuées</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </FilterField>
        <div className="flex flex-wrap items-center gap-2 pb-2 text-xs">
          {Object.entries(KIND).map(([k, v]) => <span key={k} className={cn('rounded border-l-4 px-2 py-0.5 ring-1 ring-line', v.cls)}>{v.label}</span>)}
        </div>
      </FilterBar>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((day, i) => {
          const list = visible.filter((it) => it.day === day).sort((a, b) => (a.time ?? '00:00').localeCompare(b.time ?? '00:00'))
          return (
            <section key={day} className={cn('min-h-32 rounded-card border border-line bg-surface p-2', day === today && 'ring-2 ring-accent-400')}>
              <h3 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{DAYS[i]}</span><span className="tabular">{day.slice(8, 10)}/{day.slice(5, 7)}</span>
              </h3>
              <ul className="space-y-1.5">
                {list.length === 0 ? <li className="text-xs text-muted/70">—</li> : null}
                {list.map((it, j) => (
                  <li key={j}>
                    <Link href={it.href} className={cn('block rounded border-l-4 px-2 py-1 text-xs ring-1 ring-line hover:ring-brand-300', KIND[it.kind].cls)}>
                      <span className="flex items-center justify-between gap-1 text-[11px] text-muted">
                        <span>{KIND[it.kind].label}</span>{it.time ? <span className="tabular">{it.time}</span> : null}
                      </span>
                      <span className="block font-medium text-ink">{it.title}</span>
                      {it.sub ? <span className="block text-muted">{it.sub}</span> : null}
                      {it.owner ? <span className="block text-[11px] text-muted">{names.get(it.owner)}</span> : null}
                      {it.warn ? <Badge tone="warning" className="mt-0.5">À surveiller</Badge> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
