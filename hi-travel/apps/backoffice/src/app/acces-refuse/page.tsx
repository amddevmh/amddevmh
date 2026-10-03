import Link from 'next/link'

export const metadata = { title: 'Accès refusé' }

export default function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent-600">403</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-900">Accès refusé</h1>
        <p className="mt-2 text-sm text-muted">Votre profil ne dispose pas des droits nécessaires pour cette page. Contactez la direction si besoin.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">Retour au tableau de bord</Link>
      </div>
    </div>
  )
}
