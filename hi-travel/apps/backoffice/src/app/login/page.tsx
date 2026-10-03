import Image from 'next/image'
import { LoginForm } from './login-form'

export const metadata = { title: 'Connexion' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <Image src="/hi-travel-logo.png" alt="HI Travel" width={136} height={40} priority />
        <h1 className="mt-6 text-xl font-semibold text-brand-900">Back office</h1>
        <p className="mt-1 text-sm text-muted">Connexion réservée aux collaborateurs HI Travel.</p>
        <LoginForm next={next ?? '/'} />
      </div>
    </div>
  )
}
