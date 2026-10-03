import { Alert } from '@hi/ui'

/**
 * Messages de confirmation après une action dont le formulaire disparaît (pièce validée, rejetée…).
 * Codes fixes : aucun texte libre n'est repris de l'URL (seule une référence alphanumérique).
 */
const NOTICES: Record<string, { tone: 'success' | 'info' | 'warning'; text: (ref?: string) => string }> = {
  invoice_validated: { tone: 'success', text: (r) => `Pièce validée sous le numéro ${r ?? ''}. Elle est désormais figée ; l’écriture a été générée en brouillard.` },
  invoice_cancelled: { tone: 'info', text: () => 'Brouillon annulé (conservé pour l’historique).' },
  payment_validated: { tone: 'success', text: () => 'Règlement validé : mouvement de trésorerie et écriture en brouillard créés.' },
  payment_rejected: { tone: 'warning', text: () => 'Règlement rejeté. Les états et justificatifs sont conservés ; la créance est recalculée.' },
  payment_reversed: { tone: 'warning', text: () => 'Contre-écriture validée : le règlement initial est conservé.' },
  si_validated: { tone: 'success', text: () => 'Pièce fournisseur validée : écriture d’achat générée en brouillard.' },
  si_allocated: { tone: 'success', text: (r) => `${r ?? ''} ventilation(s) enregistrée(s) avec leur méthode et leur clé.` },
  si_cancelled: { tone: 'info', text: () => 'Pièce fournisseur annulée (conservée pour l’historique).' },
  entry_posted: { tone: 'success', text: (r) => `Pièce comptable validée sous le n° ${r ?? ''}.` },
  period_closed: { tone: 'success', text: () => 'Période clôturée : plus aucune écriture ne peut y être validée.' },
  period_reopened: { tone: 'warning', text: () => 'Période rouverte ; le motif est conservé dans le journal d’audit.' },
  offer_review: { tone: 'info', text: () => 'Offre soumise à validation.' },
  offer_published: { tone: 'success', text: () => 'Offre publiée (visible sur le site selon la programmation).' },
  offer_hidden: { tone: 'info', text: () => 'Offre masquée du site public.' },
  offer_archived: { tone: 'info', text: () => 'Offre archivée.' },
  offer_draft: { tone: 'info', text: () => 'Offre repassée en brouillon.' },
}

export function Notice({ code, refValue }: { code?: string; refValue?: string }) {
  const n = code ? NOTICES[code] : undefined
  if (!n) return null
  const ref = refValue && /^[A-Za-z0-9-]{1,40}$/.test(refValue) ? refValue : undefined
  return <Alert tone={n.tone} className="mb-4">{n.text(ref)}</Alert>
}
