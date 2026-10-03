import type { ActionState } from '@/lib/actions'

export interface DuplicateMatch {
  id: string
  display_name: string | null
  email: string | null
  phone: string | null
  match_reason: string | null
}

/** État du formulaire client : doublons possibles à confirmer avant création. */
export interface ClientFormState extends ActionState {
  duplicates?: DuplicateMatch[]
}

export interface QuoteLinePayload {
  id?: string
  activity: string
  service_type: string
  description: string
  supplier_id: string | null
  start_date: string | null
  end_date: string | null
  pax_type: string
  quantity: number
  unit_cost: number
  cost_currency: string
  fx_rate: number
  unit_price: number
  is_optional: boolean
  option_selected: boolean
  is_mandatory: boolean
  room_type?: string
  board?: string
}

export interface PaymentTermPayload {
  label: string
  kind: 'deposit' | 'installment' | 'balance'
  mode: 'amount' | 'percent'
  value: number
  due: 'date' | 'days'
  due_date?: string
  days_before_departure?: number
}

export interface QuoteVersionPayload {
  version_id: string
  label: string
  language: 'fr' | 'en'
  start_date: string | null
  end_date: string | null
  adults: number
  children: number
  infants: number
  currency: string
  valid_until: string | null
  inclusions: string[]
  exclusions: string[]
  client_notes: string
  internal_notes: string
  program: Array<{ day: number; title: string; description: string }>
  lines: QuoteLinePayload[]
  terms: PaymentTermPayload[]
}
