import { Tabs } from '@/components/page'

export const ACCOUNTING_TABS = [
  { href: '/comptabilite', label: 'Brouillard' },
  { href: '/comptabilite/saisie', label: 'Saisie manuelle (OD)' },
  { href: '/comptabilite/journal', label: 'Journaux' },
  { href: '/comptabilite/grand-livre', label: 'Grand livre' },
  { href: '/comptabilite/balance', label: 'Balance' },
  { href: '/comptabilite/balance-agee', label: 'Balance âgée' },
  { href: '/comptabilite/periodes', label: 'Périodes' },
  { href: '/comptabilite/plan', label: 'Plan comptable et règles' },
]

export function AccountingTabs({ current, draftCount }: { current: string; draftCount?: number }) {
  return <Tabs current={current} tabs={ACCOUNTING_TABS.map((t) => (t.href === '/comptabilite' && draftCount != null ? { ...t, count: draftCount } : t))} />
}
