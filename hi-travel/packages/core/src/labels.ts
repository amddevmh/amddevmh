/** Libellés français des énumérations de la base (une seule source pour les deux applications). */

export const ACTIVITIES = [
  'hotel_tn', 'hotel_intl', 'tailor_made', 'organized_trip', 'visa', 'ticketing', 'circuit', 'transport', 'mice',
] as const
export type Activity = (typeof ACTIVITIES)[number]

export const activityLabels: Record<Activity, string> = {
  hotel_tn: 'Hôtels en Tunisie',
  hotel_intl: 'Hôtels à l’étranger',
  tailor_made: 'Voyages à la carte',
  organized_trip: 'Voyages organisés',
  visa: 'Visa',
  ticketing: 'Billetterie',
  circuit: 'Circuits',
  transport: 'Transport',
  mice: 'Événements et MICE',
}

/** Segments d'URL publics des neuf activités (FO01). */
export const activitySlugs: Record<Activity, string> = {
  hotel_tn: 'hotels-tunisie',
  hotel_intl: 'hotels-etranger',
  tailor_made: 'voyages-a-la-carte',
  organized_trip: 'voyages-organises',
  visa: 'visa',
  ticketing: 'billetterie',
  circuit: 'circuits',
  transport: 'transport',
  mice: 'evenements-mice',
}

export function activityFromSlug(slug: string): Activity | undefined {
  return (Object.entries(activitySlugs) as [Activity, string][]).find(([, s]) => s === slug)?.[0]
}

export const dossierStatusLabels: Record<string, string> = {
  request: 'Demande',
  quote_prepared: 'Devis préparé',
  quote_sent: 'Devis envoyé',
  accepted: 'Accepté',
  booking: 'En réservation',
  confirmed: 'Confirmé',
  travelling: 'En voyage',
  completed: 'Terminé',
  archived: 'Archivé',
  cancelled: 'Annulé',
}

export const serviceStatusLabels: Record<string, string> = {
  requested: 'Demandée',
  option: 'Option',
  confirmed: 'Confirmée',
  cancelled: 'Annulée',
}

export const serviceTypeLabels: Record<string, string> = {
  flight: 'Vol',
  hotel: 'Hôtel',
  transfer: 'Transfert',
  excursion: 'Excursion',
  visa: 'Visa',
  transport: 'Transport',
  circuit: 'Circuit',
  package: 'Forfait',
  event_item: 'Prestation événement',
  insurance: 'Assurance',
  fee: 'Frais',
  other: 'Autre',
}

export const leadStageLabels: Record<string, string> = {
  received: 'Demande reçue',
  qualification: 'Qualification',
  quote: 'Devis',
  follow_up: 'Relance',
  won: 'Gagnée',
  lost: 'Perdue',
}

export const leadSourceLabels: Record<string, string> = {
  website: 'Site web',
  phone: 'Téléphone',
  walk_in: 'Agence',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  social: 'Réseaux sociaux',
  referral: 'Recommandation',
  import: 'Import',
  other: 'Autre',
}

export const quoteStatusLabels: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  rejected: 'Refusé',
  expired: 'Expiré',
  superseded: 'Remplacé',
}

export const paymentStatusLabels: Record<string, string> = {
  planned: 'Prévu',
  received: 'Reçu',
  deposited: 'Remis en banque',
  validated: 'Validé',
  rejected: 'Rejeté',
  cancelled: 'Annulé',
}

export const paymentMethodLabels: Record<string, string> = {
  cash: 'Espèces',
  transfer: 'Virement',
  card: 'Carte',
  cheque: 'Chèque',
  bill: 'Traite',
  online: 'Paiement en ligne',
}

export const invoiceKindLabels: Record<string, string> = {
  invoice: 'Facture',
  credit_note: 'Avoir',
  proforma: 'Pro forma',
}

export const invoiceStatusLabels: Record<string, string> = {
  draft: 'Brouillon',
  validated: 'Validée',
  cancelled: 'Annulée',
}

export const taskStatusLabels: Record<string, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  waiting_client: 'En attente client',
  waiting_supplier: 'En attente fournisseur',
  blocked: 'Bloquée',
  done: 'Terminée',
  cancelled: 'Annulée',
}

export const priorityLabels: Record<string, string> = {
  red: 'Urgent',
  orange: 'Aujourd’hui',
  planned: 'Planifié',
  done: 'Terminé',
}

export const publicationStatusLabels: Record<string, string> = {
  draft: 'Brouillon',
  review: 'À valider',
  published: 'Publié',
  hidden: 'Masqué',
  archived: 'Archivé',
}

export const checkStatusLabels: Record<string, string> = {
  ok: 'Conforme',
  to_complete: 'À compléter',
  blocking: 'Bloquant',
  na: 'Non applicable',
}

export const alertStatusLabels: Record<string, string> = {
  to_review: 'À examiner',
  justified: 'Justifiée',
  corrected: 'Corrigée',
  resolved: 'Résolue',
}

export const roleLabels: Record<string, string> = {
  direction: 'Direction et administration',
  commercial: 'Commercial et réservation',
  operations: 'Opérations',
  finance: 'Finance',
  site: 'Gestion du site',
}

export const documentKindLabels: Record<string, string> = {
  passport: 'Passeport',
  id_card: 'Carte d’identité',
  visa: 'Visa',
  photo: 'Photo',
  voucher: 'Voucher',
  ticket: 'Billet',
  program: 'Programme',
  quote_pdf: 'Devis',
  invoice_pdf: 'Facture',
  receipt: 'Reçu',
  contract: 'Contrat',
  supplier_confirmation: 'Confirmation fournisseur',
  supplier_invoice: 'Facture fournisseur',
  payment_proof: 'Justificatif de paiement',
  import_source: 'Fichier importé',
  other: 'Autre',
}

export const boardLabels: Record<string, string> = {
  RO: 'Logement seul',
  LPD: 'Logement petit-déjeuner',
  DP: 'Demi-pension',
  PC: 'Pension complète',
  ALL: 'All inclusive',
}

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—'
  return map[key] ?? key
}
