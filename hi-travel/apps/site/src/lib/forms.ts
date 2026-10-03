/** Types et utilitaires partagés par les formulaires (client et serveur). */

export interface FormState {
  status: 'idle' | 'error' | 'success'
  message?: string
  error?: string
  fieldErrors?: Record<string, string>
}

export const idleState: FormState = { status: 'idle' }

export interface RequestFormState extends FormState {
  reference?: string
  duplicate?: boolean
}

/** Date du jour en Tunisie, au format YYYY-MM-DD. */
export function todayTunis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
