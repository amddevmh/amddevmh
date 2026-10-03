import 'server-only'
import { randomUUID } from 'node:crypto'
import { connection } from 'next/server'
import { whatsappLink } from '@hi/integrations/messaging'
import { getAgency } from '@/lib/site-data'
import { todayTunis } from '@/lib/forms'
import { RequestForm, type RequestFormProps } from './request-form'

/**
 * Formulaire de demande rendu à chaque requête : un jeton de soumission unique
 * est généré côté serveur pour chaque affichage du formulaire (anti double clic).
 */
export async function RequestSection(props: Omit<RequestFormProps, 'token' | 'contact' | 'minDate'>) {
  await connection()
  const agency = await getAgency()
  return (
    <RequestForm
      {...props}
      token={randomUUID()}
      minDate={todayTunis()}
      contact={{
        phone: agency.phone,
        phoneHref: agency.phone ? `tel:${agency.phone.replace(/\s/g, '')}` : undefined,
        whatsappHref: agency.whatsapp ? whatsappLink(agency.whatsapp) : undefined,
      }}
    />
  )
}
