import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/auth-card'
import { LoginForm } from '@/components/auth-forms'
import { t } from '@/lib/i18n'
import { safeNext } from '@/lib/portal'
import { createSessionClient } from '@/lib/supabase'

export const metadata: Metadata = { title: t.portal.loginTitle, robots: { index: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && sp.erreur !== 'compte') {
    const { data: account } = await supabase.from('client_accounts').select('client_id').eq('user_id', user.id).maybeSingle()
    if (account) redirect(next)
  }
  return (
    <AuthCard title={t.portal.loginTitle} intro={t.portal.loginIntro} footer={<><p>{t.portal.noAccount}</p><p className="mt-2"><Link href="/contact" className="font-medium text-brand-600 hover:underline">{t.cta.contactUs}</Link></p></>}>
      <LoginForm next={next} initialError={sp.erreur === 'compte' ? t.portal.notClient : undefined} />
    </AuthCard>
  )
}
