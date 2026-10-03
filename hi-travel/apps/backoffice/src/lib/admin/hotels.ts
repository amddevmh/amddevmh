import 'server-only'
import { createAdminClient } from '@hi/db/admin'
import type { Json } from '@hi/db'
import { getHotelProvider, maskForLog, type HotelProvider, type SimulationMode } from '@hi/integrations/hotels'
import type { Supabase } from '@/lib/fin/data'

export interface ConnectorRow {
  code: string
  label: string
  enabled: boolean
  mode: string
  capabilities: Record<string, boolean>
  config: { simulate?: SimulationMode; [k: string]: unknown }
  notes: string | null
  updated_at: string
}

export const SIMULATION_MODES: Record<SimulationMode, string> = {
  ok: 'Normal',
  down: 'Indisponible (panne)',
  slow: 'Lent (délai de réponse)',
  timeout_on_book: 'Délai dépassé à la réservation',
  price_change: 'Prix modifié à la revérification',
}

export const CAPABILITY_LABELS: Record<string, string> = {
  search: 'Recherche',
  book: 'Réservation',
  confirm: 'Confirmation',
  voucher: 'Voucher',
  modify: 'Modification',
  cancel: 'Annulation',
  idempotency_key: 'Idempotence native',
}

/** Fournisseurs simulés : correspondance connecteur → fiche fournisseur. */
export const CONNECTOR_SUPPLIER_NAME: Record<string, string> = {
  hotel_api_tunisiabeds: 'Tunisiabeds',
  hotel_api_mygo: 'MyGo',
}

export async function loadHotelConnectors(supabase: Supabase): Promise<ConnectorRow[]> {
  const { data } = await supabase.from('integration_connectors').select('*').eq('kind', 'hotel_api').order('code')
  return (data ?? []) as unknown as ConnectorRow[]
}

export function providerFor(c: ConnectorRow): HotelProvider {
  return getHotelProvider(c.code, { simulate: (c.config?.simulate as SimulationMode | undefined) ?? 'ok' })
}

export function isSimulation(v: unknown): v is SimulationMode {
  return typeof v === 'string' && v in SIMULATION_MODES
}

/**
 * Journal technique (API04) : écrit avec la clé service APRÈS le contrôle des droits par l'appelant.
 * Les données personnelles et secrets sont masqués ; l'échec du journal ne bloque jamais l'opération.
 */
export async function logApiCall(entry: {
  connector: string
  operation: string
  status: 'success' | 'error' | 'timeout' | 'unavailable'
  durationMs?: number
  requestId?: string
  request?: unknown
  response?: unknown
  error?: string
  actorId: string
}) {
  try {
    const admin = createAdminClient()
    await admin.from('api_call_logs').insert({
      connector_code: entry.connector,
      operation: entry.operation,
      status: entry.status,
      duration_ms: entry.durationMs != null ? Math.round(entry.durationMs) : null,
      request_id: entry.requestId ?? null,
      request_summary: (maskForLog(entry.request ?? null) ?? null) as Json,
      response_summary: (maskForLog(entry.response ?? null) ?? null) as Json,
      error_message: entry.error ?? null,
      actor_id: entry.actorId,
    })
  } catch {
    // journal indisponible : ne bloque pas l'opération métier
  }
}
