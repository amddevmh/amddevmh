'use client'

import { Button } from '@hi/ui'
import { t } from '@/lib/i18n'

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold text-brand-900">{t.errors.errorTitle}</h1>
      <p className="mt-2 text-muted">{t.errors.errorText}</p>
      <Button className="mt-8" size="lg" onClick={() => reset()}>{t.errors.retry}</Button>
    </div>
  )
}
