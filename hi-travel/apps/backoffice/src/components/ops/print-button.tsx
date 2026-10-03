'use client'

import { Button } from '@hi/ui'

export function PrintButton({ label = 'Imprimer / PDF' }: { label?: string }) {
  return <Button type="button" onClick={() => window.print()}>{label}</Button>
}
