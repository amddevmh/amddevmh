/** Libellés complémentaires (ventes & opérations) non couverts par @hi/core. */
import type { Activity } from '@hi/core'

export const WAITING_STATUSES = ['waiting_client', 'waiting_supplier', 'blocked'] as const
export const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'waiting_client', 'waiting_supplier', 'blocked'] as const

export const deadlineKindLabels: Record<string, string> = {
  ticket_issue: 'Limite d’émission billets',
  option_expiry: 'Expiration d’option',
  hotel_payment: 'Règlement hôtel',
  supplier_payment: 'Règlement fournisseur',
  visa_appointment: 'Rendez-vous visa',
  rooming_list: 'Envoi rooming list',
  other: 'Autre',
}

export const deadlineSourceLabels: Record<string, string> = {
  supplier: 'Fournisseur',
  api: 'API',
  report: 'Rapport importé',
  manual: 'Saisie justifiée',
}

export const deadlineStatusLabels: Record<string, string> = {
  open: 'Ouverte',
  met: 'Respectée',
  missed: 'Dépassée',
  cancelled: 'Annulée',
}

/** Statuts internes : ils décrivent l’avancement, jamais une promesse de délivrance du visa. */
export const visaStatusLabels: Record<string, string> = {
  collecting: 'Collecte des pièces',
  ready: 'Dossier complet',
  appointment: 'Rendez-vous fixé',
  submitted: 'Déposé',
  decision_received: 'Décision reçue',
  passport_returned: 'Passeport restitué',
  cancelled: 'Annulé',
}

export const visaDecisionLabels: Record<string, string> = {
  pending: 'En attente de décision',
  granted: 'Accordé (décision consulaire)',
  refused: 'Refusé (décision consulaire)',
}

export const ticketStatusLabels: Record<string, string> = {
  pending: 'À émettre',
  issued: 'Émis',
  reissued: 'Réémis',
  void: 'Annulé (void)',
  refund_expected: 'Remboursement attendu',
  refunded: 'Remboursé',
}

export const attendanceLabels: Record<string, string> = {
  invited: 'Invité',
  registered: 'Inscrit',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
  attended: 'Présent',
}

export const financialStatusLabels: Record<string, string> = {
  open: 'Suivi financier ouvert',
  follow_up: 'En suivi (revue requise)',
  closed: 'Clôturé financièrement',
  closed_with_exception: 'Clôturé avec exception',
}

export const supplierKindLabels: Record<string, string> = {
  hotel: 'Hôtel',
  hotel_platform: 'Centrale / plateforme hôtelière',
  airline: 'Compagnie aérienne',
  ticketing_platform: 'Plateforme billetterie',
  transport: 'Transporteur',
  guide: 'Guide',
  restaurant: 'Restauration',
  venue: 'Lieu / salle',
  event_service: 'Prestataire événementiel',
  visa_center: 'Centre visa',
  insurance: 'Assurance',
  other: 'Autre',
}

export const alertSeverityLabels: Record<string, string> = {
  red: 'Critique',
  orange: 'À surveiller',
  info: 'Information',
}

export const incidentKindLabels: Record<string, string> = {
  incident: 'Incident',
  complaint: 'Réclamation',
  modification: 'Modification',
  cancellation: 'Annulation',
}

export const incidentStatusLabels: Record<string, string> = {
  open: 'Ouvert',
  in_progress: 'En cours',
  resolved: 'Résolu',
  closed: 'Clos',
}

export const channelLabels: Record<string, string> = {
  note: 'Note',
  phone: 'Téléphone',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  meeting: 'Rendez-vous',
  site: 'Site web',
}

export const holdKindLabels: Record<string, string> = { option: 'Option', confirmed: 'Confirmée' }
export const holdStatusLabels: Record<string, string> = {
  active: 'Active',
  released: 'Libérée',
  expired: 'Expirée',
  converted: 'Convertie',
}

export const departureStatusLabels: Record<string, string> = { open: 'Ouvert', closed: 'Fermé', cancelled: 'Annulé' }

export const clientKindLabels: Record<string, string> = { person: 'Particulier', company: 'Entreprise' }

export const scheduleKindLabels: Record<string, string> = { deposit: 'Acompte', installment: 'Tranche', balance: 'Solde' }

export const paxTypeLabels: Record<string, string> = { adult: 'Adulte', child: 'Enfant', infant: 'Bébé', all: 'Tous' }

export const checkCategoryLabels: Record<string, string> = {
  operations: 'Préparation opérationnelle',
  finance: 'Situation financière',
}

export const languageLabels: Record<string, string> = { fr: 'Français', en: 'Anglais', ar: 'Arabe' }

/** Types de prestation proposés par défaut dans chaque module métier. */
export const moduleServiceTypes: Record<Activity, string[]> = {
  hotel_tn: ['hotel'],
  hotel_intl: ['hotel'],
  tailor_made: ['flight', 'hotel', 'transfer', 'excursion', 'visa', 'insurance', 'other'],
  organized_trip: ['package', 'hotel', 'flight', 'transfer', 'excursion', 'other'],
  visa: ['visa'],
  ticketing: ['flight'],
  circuit: ['circuit', 'hotel', 'excursion', 'transport', 'other'],
  transport: ['transfer', 'transport'],
  mice: ['event_item', 'hotel', 'transport', 'transfer', 'flight', 'other'],
}

export const QUOTE_SERVICE_TYPES = [
  'flight', 'hotel', 'transfer', 'excursion', 'visa', 'transport', 'circuit', 'package', 'event_item', 'insurance', 'fee', 'other',
] as const

export const SUPPLIER_KINDS = Object.keys(supplierKindLabels)
