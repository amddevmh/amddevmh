import { Tabs } from '@/components/page'

const TABS = [
  { href: '/parametres', label: 'Utilisateurs' },
  { href: '/parametres/droits', label: 'Matrice des droits' },
  { href: '/parametres/fiscalite', label: 'Règles fiscales' },
  { href: '/parametres/numerotation', label: 'Numérotation' },
  { href: '/parametres/urgences', label: 'Seuils d’urgence' },
  { href: '/parametres/affectation', label: 'Affectation des demandes' },
  { href: '/parametres/canaux', label: 'Canaux' },
  { href: '/parametres/paiement', label: 'Paiement en ligne' },
]

export function SettingsTabs({ current }: { current: string }) {
  return <Tabs current={current} tabs={TABS} />
}
