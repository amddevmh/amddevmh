'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Rafraîchit la page (données serveur) à intervalle régulier, un nombre limité de fois. */
export function AutoRefresh({ everyMs = 3000, max = 20 }: { everyMs?: number; max?: number }) {
  const router = useRouter()
  useEffect(() => {
    let n = 0
    const id = setInterval(() => {
      n += 1
      if (n > max) return clearInterval(id)
      router.refresh()
    }, everyMs)
    return () => clearInterval(id)
  }, [router, everyMs, max])
  return null
}
