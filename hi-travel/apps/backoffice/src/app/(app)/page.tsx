import Link from 'next/link'
import { dossierStatusLabels, formatDateFr, formatMoney } from '@hi/core'
import { Badge, Card, CardBody, CardHeader, EmptyState, StatusBadge, buttonClass } from '@hi/ui'
import { PageHeader } from '@/components/page'
import { Counter, PriorityBadge, TimeLeft } from '@/components/ops/ui'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/ops/data'
import { addDaysIso, todayIso } from '@/lib/ops/format'

export const metadata = { title: 'Tableau de bord' }

type Counters = Record<string, number | undefined>

interface CounterDef { key: string; label: string; href: string; tone?: (n: number) => 'neutral' | 'danger' | 'warning' | 'success'; money?: boolean; hint?: string }

type Tone = 'neutral' | 'danger' | 'warning' | 'success'
const warnIf = (n: number): Tone => (n > 0 ? 'warning' : 'neutral')
const dangerIf = (n: number): Tone => (n > 0 ? 'danger' : 'neutral')

export default async function DashboardPage() {
  const session = await requireStaff()
  const supabase = await db()
  const today = todayIso()
  const in7 = addDaysIso(today, 7)

  const [{ data: raw }, myTasks, nextDepartures, groupDepartures] = await Promise.all([
    supabase.rpc('dashboard_counters'),
    session.can('tasks')
      ? supabase.from('task_board').select('*').eq('assignee_id', session.userId).in('priority', ['red', 'orange']).order('priority_rank').order('due_at').limit(8)
      : Promise.resolve({ data: [] as never[] }),
    session.can('dossiers')
      ? supabase.from('dossiers').select('id, reference, title, start_date, status, clients(display_name)')
        .in('status', ['accepted', 'booking', 'confirmed']).gte('start_date', today).order('start_date').limit(8)
      : Promise.resolve({ data: [] as never[] }),
    session.can('departures')
      ? supabase.from('departures').select('id, code, start_date, capacity, seats_confirmed, seats_on_option, offers(title)')
        .eq('status', 'open').gte('start_date', today).order('start_date').limit(5)
      : Promise.resolve({ data: [] as never[] }),
  ])
  const c = (raw ?? {}) as Counters

  const groups: Array<{ title: string; description: string; items: CounterDef[] }> = [
    {
      title: 'Départs et confirmations',
      description: 'Ce qui conditionne le départ des voyageurs.',
      items: [
        { key: 'departures_7d', label: 'Départs sous 7 jours', href: `/dossiers?statut=accepted,booking,confirmed&depart_du=${today}&depart_au=${in7}`, tone: warnIf },
        { key: 'options_to_confirm', label: 'Options à confirmer', href: '/modules?statut=option', tone: warnIf },
        { key: 'options_expiring_48h', label: 'Options expirant sous 48 h', href: '/modules?statut=option&expire=48h', tone: dangerIf },
        { key: 'ticket_issue_48h', label: 'Émissions billets sous 48 h', href: '/taches/echeances?type=ticket_issue&sous=48h', tone: dangerIf },
        { key: 'unconfirmed_services', label: 'Prestations non confirmées', href: '/modules?statut=requested,option', tone: warnIf },
        { key: 'services_to_review', label: 'Prestations à revoir', href: '/modules?revue=1', tone: dangerIf, hint: 'Suite à une modification liée' },
        { key: 'missing_documents', label: 'Pièces manquantes', href: '/dossiers?pieces=manquantes', tone: warnIf },
        { key: 'deadlines_to_complete', label: 'Délais à compléter', href: '/taches/echeances?filtre=a_completer', tone: warnIf, hint: 'Dates fournisseur non reçues' },
        { key: 'open_alerts', label: 'Alertes à examiner', href: '/alertes?statut=to_review', tone: warnIf },
      ],
    },
    {
      title: 'Commercial',
      description: 'Demandes et devis en attente d’action.',
      items: [
        { key: 'unanswered_leads', label: 'Demandes sans réponse', href: '/crm/demandes?etape=received', tone: warnIf },
        { key: 'unassigned_leads', label: 'Demandes sans responsable', href: '/crm/demandes?responsable=aucun', tone: dangerIf },
        { key: 'quotes_to_follow_up', label: 'Devis à relancer', href: '/devis?relance=1', tone: warnIf, hint: 'Envoyés depuis plus de 3 jours' },
      ],
    },
    {
      title: 'Tâches',
      description: 'Affectation et retards de l’équipe.',
      items: [
        { key: 'overdue_tasks', label: 'Tâches en retard', href: '/taches?retard=1', tone: dangerIf },
        { key: 'unassigned_tasks', label: 'Tâches sans responsable', href: '/aujourdhui?vue=equipe&responsable=aucun', tone: warnIf },
      ],
    },
    {
      title: 'Finances',
      description: 'Encaissements, échéances et dettes fournisseurs.',
      items: [
        { key: 'client_overdue_amount', label: 'Impayés clients échus', href: '/dossiers?impayes=1', tone: dangerIf, money: true },
        { key: 'client_due_7d', label: 'Échéances clients sous 7 jours', href: '/dossiers?echeances=7', tone: warnIf, money: true },
        { key: 'supplier_due_7d', label: 'Dettes fournisseurs sous 7 jours', href: '/finances/fournisseurs', tone: warnIf, money: true },
        { key: 'refunds_pending', label: 'Remboursements attendus', href: '/modules/ticketing?billets=refund_expected', tone: warnIf },
        { key: 'cheques_to_deposit', label: 'Chèques / traites à remettre', href: '/finances/reglements', tone: warnIf },
        { key: 'unallocated_payments', label: 'Règlements non affectés', href: '/finances/reglements', tone: warnIf },
      ],
    },
  ]
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => c[i.key] !== undefined) }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description={`Bonjour ${session.profile.full_name} — situation au ${formatDateFr(today)}. Chaque indicateur ouvre la liste filtrée correspondante.`}
        actions={session.can('tasks') ? <Link href="/aujourdhui" className={buttonClass('accent')}>À traiter aujourd’hui</Link> : null}
      />

      <div className="space-y-6">
        {visibleGroups.map((g) => (
          <section key={g.title}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="font-display text-base font-semibold text-brand-900">{g.title}</h2>
              <p className="text-xs text-muted">{g.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {g.items.map((i) => {
                const n = Number(c[i.key] ?? 0)
                return <Counter key={i.key} label={i.label} value={i.money ? formatMoney(n) : n} href={i.href} tone={i.tone?.(n) ?? 'neutral'} hint={i.hint} />
              })}
            </div>
          </section>
        ))}
        {visibleGroups.length === 0 ? (
          <Card><EmptyState title="Aucun indicateur pour votre profil" description="Vos droits ne couvrent pas les dossiers, demandes, tâches ou finances." /></Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          {session.can('tasks') ? (
            <Card>
              <CardHeader title="Mes tâches urgentes" description="Rouge et orange, avec le motif de priorité." actions={<Link href="/aujourdhui?vue=moi" className="text-sm text-brand-600 hover:underline">Tout voir</Link>} />
              <CardBody className="p-0">
                {myTasks.data?.length ? (
                  <ul className="divide-y divide-line">
                    {myTasks.data.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{t.title}</p>
                          <p className="text-xs text-muted">
                            {t.dossier_id ? <Link href={`/dossiers/${t.dossier_id}`} className="text-brand-600 hover:underline">{t.dossier_reference}</Link> : 'Hors dossier'}
                            {t.client_name ? ` — ${t.client_name}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <PriorityBadge level={t.priority} reason={t.priority_reason} />
                          <TimeLeft dueAt={t.due_at} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState title="Aucune tâche urgente" description="Vos tâches rouges et orange apparaîtront ici." />}
              </CardBody>
            </Card>
          ) : null}

          {session.can('dossiers') ? (
            <Card>
              <CardHeader title="Prochains départs" description="Dossiers acceptés, en réservation ou confirmés." actions={<Link href={`/dossiers?depart_du=${today}&statut=accepted,booking,confirmed`} className="text-sm text-brand-600 hover:underline">Tout voir</Link>} />
              <CardBody className="p-0">
                {nextDepartures.data?.length ? (
                  <ul className="divide-y divide-line">
                    {nextDepartures.data.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <Link href={`/dossiers/${d.id}`} className="font-medium text-brand-600 hover:underline">{d.reference}</Link>
                          <p className="truncate text-xs text-muted">{d.title} — {(d.clients as { display_name?: string } | null)?.display_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={d.status} labels={dossierStatusLabels} />
                          <span className="text-sm tabular">{formatDateFr(d.start_date)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState title="Aucun départ à venir" />}
              </CardBody>
            </Card>
          ) : null}

          {session.can('departures') && groupDepartures.data?.length ? (
            <Card className="xl:col-span-2">
              <CardHeader title="Départs groupes" description="Capacité, places confirmées et options." actions={<Link href="/departs" className="text-sm text-brand-600 hover:underline">Départs et groupes</Link>} />
              <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {groupDepartures.data.map((g) => {
                  const avail = g.capacity - g.seats_confirmed - g.seats_on_option
                  return (
                    <Link key={g.id} href={`/departs/${g.id}`} className="rounded-lg border border-line p-3 hover:border-brand-300">
                      <p className="text-xs text-muted">{formatDateFr(g.start_date)}</p>
                      <p className="font-medium text-brand-900">{g.code}</p>
                      <p className="truncate text-xs text-muted">{(g.offers as { title?: string } | null)?.title}</p>
                      <p className="mt-1 text-xs">{g.seats_confirmed} conf. · {g.seats_on_option} opt. · <Badge tone={avail <= 0 ? 'danger' : avail < 5 ? 'warning' : 'success'}>{avail} dispo</Badge></p>
                    </Link>
                  )
                })}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}
