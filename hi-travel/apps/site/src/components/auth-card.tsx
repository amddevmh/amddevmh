import type { ReactNode } from 'react'
import { Icon } from './icons'

export function AuthCard({ title, intro, children, footer }: { title: string; intro?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-canvas px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-line bg-white p-6 shadow-lg sm:p-8">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Icon name="lock" className="size-6" /></span>
          <h1 className="mt-4 text-2xl font-semibold text-brand-900">{title}</h1>
          {intro ? <p className="mt-2 text-sm text-muted">{intro}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
      </div>
    </div>
  )
}
