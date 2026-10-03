/** État des fournisseurs simulés (réservations, mode de simulation), partagé dans le processus serveur. */

import type { SimulationMode } from './types'

interface StoredBooking {
  requestId: string
  externalRef: string
  amount: number
  currency: string
  createdAt: string
  status: 'confirmed' | 'pending' | 'cancelled'
}

interface ProviderState {
  bookings: Map<string, StoredBooking>
  simulate: SimulationMode
  bookCalls: number
}

const g = globalThis as unknown as { __hiMockHotelState?: Map<string, ProviderState> }
const states = (g.__hiMockHotelState ??= new Map())

export function providerState(code: string): ProviderState {
  let s = states.get(code)
  if (!s) {
    s = { bookings: new Map(), simulate: 'ok', bookCalls: 0 }
    states.set(code, s)
  }
  return s
}

export function setSimulation(code: string, mode: SimulationMode) {
  providerState(code).simulate = mode
}

export function resetMockProviders() {
  states.clear()
}

/** Pseudo-aléatoire déterministe (mêmes paramètres → mêmes prix). */
export function seeded(...parts: Array<string | number>): number {
  let h = 2166136261
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10_000) / 10_000
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export type { StoredBooking }
