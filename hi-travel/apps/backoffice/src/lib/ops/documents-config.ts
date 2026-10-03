/** Règles de dépôt des documents (mêmes valeurs que le bucket privé et la table documents). */
export const ALLOWED_MIME = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
export const MAX_BYTES = 15 * 1024 * 1024
/** Pièces d’identité : toujours sensibles (trigger SQL), jamais publiées automatiquement. */
export const SENSITIVE_KINDS = ['passport', 'id_card', 'visa', 'photo']
export const DOCUMENT_KINDS = [
  'passport', 'id_card', 'visa', 'photo', 'voucher', 'ticket', 'program', 'quote_pdf', 'invoice_pdf', 'receipt', 'contract',
  'supplier_confirmation', 'supplier_invoice', 'payment_proof', 'import_source', 'other',
] as const
