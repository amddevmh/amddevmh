'use client'

import { Button } from '@hi/ui'

export function PrintButton({ label = 'Imprimer / enregistrer en PDF' }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      {label}
    </Button>
  )
}
