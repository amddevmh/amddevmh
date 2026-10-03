import type { Module } from './auth'

export interface NavItem {
  href: string
  label: string
  module?: Module
  children?: NavItem[]
}

/**
 * Menu proposé par le cahier des charges (section 3). Chaque entrée n'apparaît
 * que si le rôle possède le droit de lecture du module.
 */
export const NAV: NavItem[] = [
  { href: '/', label: 'Tableau de bord' },
  { href: '/aujourdhui', label: 'À traiter aujourd’hui', module: 'tasks' },
  {
    href: '/modules', label: 'Modules métiers', module: 'dossiers',
    children: [
      { href: '/modules/hotel_tn', label: 'Hôtels en Tunisie' },
      { href: '/modules/hotel_intl', label: 'Hôtels à l’étranger' },
      { href: '/modules/tailor_made', label: 'Voyages à la carte' },
      { href: '/modules/organized_trip', label: 'Voyages organisés' },
      { href: '/modules/visa', label: 'Visa' },
      { href: '/modules/ticketing', label: 'Billetterie' },
      { href: '/modules/circuit', label: 'Circuits' },
      { href: '/modules/transport', label: 'Transport' },
      { href: '/modules/mice', label: 'Événements et MICE' },
    ],
  },
  {
    href: '/crm', label: 'Clients et entreprises', module: 'crm',
    children: [
      { href: '/crm/demandes', label: 'Demandes' },
      { href: '/crm/clients', label: 'Clients' },
    ],
  },
  {
    href: '/devis', label: 'Devis et dossiers', module: 'quotes',
    children: [
      { href: '/devis', label: 'Devis' },
      { href: '/dossiers', label: 'Dossiers', module: 'dossiers' },
    ],
  },
  { href: '/departs', label: 'Départs et groupes', module: 'departures' },
  { href: '/fournisseurs', label: 'Fournisseurs', module: 'suppliers' },
  {
    href: '/finances', label: 'Finances et comptabilité', module: 'finance',
    children: [
      { href: '/finances/factures', label: 'Factures et avoirs' },
      { href: '/finances/reglements', label: 'Règlements' },
      { href: '/finances/tresorerie', label: 'Caisse et banques' },
      { href: '/finances/fournisseurs', label: 'Pièces fournisseurs' },
      { href: '/comptabilite', label: 'Comptabilité', module: 'accounting' },
    ],
  },
  { href: '/alertes', label: 'Rapprochements et alertes' },
  { href: '/documents', label: 'Documents', module: 'documents' },
  { href: '/taches', label: 'Tâches et calendrier', module: 'tasks' },
  {
    href: '/site', label: 'Offres et site internet', module: 'site',
    children: [
      { href: '/site/offres', label: 'Offres' },
      { href: '/site/pages', label: 'Pages et redirections' },
    ],
  },
  {
    href: '/integrations', label: 'Connexions et imports', module: 'imports',
    children: [
      { href: '/integrations/hotels', label: 'API hôtels Tunisie', module: 'integrations' },
      { href: '/integrations/imports', label: 'Imports de rapports' },
    ],
  },
  { href: '/rapports', label: 'Rapports', module: 'reports' },
  { href: '/parametres', label: 'Paramètres', module: 'settings' },
]
