import Link from 'next/link'
import type { Metadata } from 'next'
import { AuthCard } from '@/components/auth-card'
import { ResetRequestForm } from '@/components/auth-forms'
import { t } from '@/lib/i18n'

export const metadata: Metadata = { title: t.portal.resetTitle, robots: { index: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const sp = await searchParams
  return (
    <AuthCard title={t.portal.resetTitle} intro={t.portal.resetIntro} footer={<Link href="/espace-client/connexion" className="font-medium text-brand-600 hover:underline">{t.portal.backToLogin}</Link>}>
      <ResetRequestForm invalidLink={sp.lien === 'invalide'} />
    </AuthCard>
  )
}
