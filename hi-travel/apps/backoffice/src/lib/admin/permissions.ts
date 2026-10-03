/** Référentiel de la matrice des droits (section 3) : modules × actions configurables par rôle. */

export const ROLES = ['direction', 'commercial', 'operations', 'finance', 'site'] as const
export const ACTIONS = ['read', 'create', 'update', 'export', 'validate', 'archive'] as const
export const MODULES = [
  'crm', 'quotes', 'dossiers', 'departures', 'suppliers', 'finance', 'accounting', 'documents',
  'identity', 'tasks', 'site', 'reports', 'settings', 'imports', 'integrations', 'margins',
] as const

export const MODULE_LABELS: Record<(typeof MODULES)[number], string> = {
  crm: 'Clients et demandes', quotes: 'Devis', dossiers: 'Dossiers et prestations', departures: 'Départs et groupes',
  suppliers: 'Fournisseurs', finance: 'Finances', accounting: 'Comptabilité', documents: 'Documents',
  identity: 'Passeports et pièces', tasks: 'Tâches', site: 'Site internet', reports: 'Rapports', settings: 'Paramètres',
  imports: 'Imports de rapports', integrations: 'Connexions API', margins: 'Coûts et marges',
}

export const ACTION_LABELS: Record<(typeof ACTIONS)[number], string> = {
  read: 'Lire', create: 'Créer', update: 'Modifier', export: 'Exporter', validate: 'Valider', archive: 'Archiver',
}
