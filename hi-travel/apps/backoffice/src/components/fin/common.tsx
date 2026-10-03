import Image from 'next/image'
import type { ReactNode } from 'react'
import { Money, Td, cn } from '@hi/ui'

/** Évite l'affichage « -0,000 » (zéro négatif issu d'un changement de signe). */
function clean(value: number | string | null | undefined) {
  return value != null && value !== '' && Number(value) === 0 ? 0 : value
}

/** Cellule de montant alignée à droite (3 décimales en TND). */
export function MoneyTd({ value, currency, className, strong }: { value: number | string | null | undefined; currency?: string; className?: string; strong?: boolean }) {
  return (
    <Td className={cn('text-right', strong && 'font-semibold', className)}>
      <Money value={clean(value)} currency={currency} />
    </Td>
  )
}

/** Montant aligné à droite hors tableau. */
export function Amount({ value, currency, className }: { value: number | string | null | undefined; currency?: string; className?: string }) {
  return <Money value={clean(value)} currency={currency} className={cn('inline-block text-right', className)} />
}

/**
 * Zone imprimable : à l'impression, seul ce bloc est visible (menu, barre supérieure masqués).
 * L'utilisateur imprime en PDF depuis le navigateur.
 */
export function PrintArea({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div id="print-area" className="mx-auto max-w-[820px] rounded-card border border-line bg-white p-8 text-sm text-ink">
        {children}
      </div>
    </>
  )
}

export interface AgencyInfo {
  name?: string
  email?: string
  phone?: string
  address?: string
}

/** En-tête HI Travel des pièces imprimables. */
export function PrintHeader({ agency, title, reference, subtitle }: { agency: AgencyInfo; title: string; reference?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-8 flex items-start justify-between gap-6 border-b-2 border-accent-400 pb-5">
      <div>
        <Image src="/hi-travel-logo.png" alt="HI Travel" width={150} height={44} priority />
        <div className="mt-3 text-xs leading-5 text-muted">
          <p className="font-semibold text-brand-900">{agency.name ?? 'HI Travel'}</p>
          {agency.address ? <p>{agency.address}</p> : null}
          <p>{[agency.phone, agency.email].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-display text-2xl font-semibold uppercase tracking-wide text-brand-900">{title}</p>
        {reference ? <p className="mt-1 font-mono text-sm text-brand-700">{reference}</p> : null}
        {subtitle ? <div className="mt-2 text-xs text-muted">{subtitle}</div> : null}
      </div>
    </div>
  )
}

/** Petite ligne « libellé : valeur » pour les blocs de synthèse. */
export function SummaryRow({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-1', strong && 'border-t border-line pt-2 font-semibold text-brand-900')}>
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

export function Section({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-card border border-line bg-surface', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-brand-900">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div>{children}</div>
    </section>
  )
}
