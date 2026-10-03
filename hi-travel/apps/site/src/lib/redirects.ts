import 'server-only'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { getRedirect } from './site-data'

/** Ancienne adresse connue → redirection éditable (site_redirects), sinon 404. */
export async function notFoundOrRedirect(path: string): Promise<never> {
  const r = await getRedirect(path)
  if (r) {
    if (r.permanent) permanentRedirect(r.to)
    redirect(r.to)
  }
  notFound()
}
