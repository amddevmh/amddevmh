import Link from 'next/link'
import type { Metadata } from 'next'
import { dossierStatusLabels, formatDateFr, formatMoney } from '@hi/core'
import { StatusBadge, buttonClass } from '@hi/ui'
import { Icon } from '@/components/icons'
import { PortalShell } from '@/components/portal-shell'
import { t } from '@/lib/i18n'
import { getPortalSession, type PortalDossier } from '@/lib/portal'

export const metadata: Metadata = { title: t.portal.title, robots: { index: false } }

/** Tableau de bord : uniquement les dossiers du client connecté (RLS). */
export default async function PortalHome() {
  const { supabase, email } = await getPortalSession('/espace-client')
  const [{ data: dossierRows }, { data: balances }] = await Promise.all([
    supabase.from('portal_dossiers')
      .select('id, reference, title, destination, start_date, end_date, status, total_price, currency')
      .order('start_date', { ascending: true, nullsFirst: false }),
    supabase.from('portal_dossier_balances').select('dossier_id, paid, balance'),
  ])
  const dossiers = dossierRows as Array<Pick<PortalDossier, 'id' | 'reference' | 'title' | 'destination' | 'start_date' | 'end_date' | 'status' | 'total_price' | 'currency'>> | null
  const bal = new Map((balances ?? []).map((b) => [b.dossier_id, b]))
  const p = t.portal
  return (
    <PortalShell email={email} crumbs={[{ label: p.title }]} title={p.myDossiers}>
      <p className="text-muted">{p.dashboardIntro}</p>
      {!dossiers || dossiers.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line bg-white p-10 text-center">
          <p className="font-semibold text-brand-900">{p.noDossiers}</p>
          <p className="mt-1 text-sm text-muted">{p.noDossiersText}</p>
          <Link href="/devis" className={buttonClass('accent', 'md', 'mt-4')}>{t.cta.requestQuote}</Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-5 md:grid-cols-2" data-testid="dossier-list">
          {dossiers.map((d) => {
            const b = bal.get(d.id)
            return (
              <li key={d.id} className="relative flex flex-col rounded-card border border-line bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{p.dossier} {d.reference}</p>
                    <h2 className="mt-1 text-lg font-semibold text-brand-900">
                      <Link href={`/espace-client/dossiers/${d.id}`} className="after:absolute after:inset-0">{d.title}</Link>
                    </h2>
                    {d.destination ? <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><Icon name="pin" className="size-4 text-accent-500" />{d.destination}</p> : null}
                  </div>
                  <StatusBadge status={d.status} labels={dossierStatusLabels} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
                  <div><dt className="text-xs text-muted">{p.dates}</dt><dd className="font-medium">{formatDateFr(d.start_date)}</dd></div>
                  <div><dt className="text-xs text-muted">{p.total}</dt><dd className="font-medium tabular">{formatMoney(d.total_price, d.currency)}</dd></div>
                  <div><dt className="text-xs text-muted">{p.balance}</dt><dd className="font-semibold text-brand-700 tabular">{formatMoney(b?.balance ?? null, d.currency)}</dd></div>
                </dl>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600">{p.open} <Icon name="arrowRight" className="size-4" /></span>
              </li>
            )
          })}
        </ul>
      )}
    </PortalShell>
  )
}
