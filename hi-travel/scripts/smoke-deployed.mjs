// Vérification d'un environnement déployé sans navigateur : connexion Supabase (cookie de session
// au format @supabase/ssr), puis chaque écran par rôle → statut HTTP, redirections, page d'erreur.
// Usage : SITE=https://… BO=https://… SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=… node scripts/smoke-deployed.mjs
import { createServerClient } from '@supabase/ssr'

const { SITE, BO, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env
const PASSWORD = process.env.DEMO_PASSWORD ?? 'HiTravel2026!'
if (!SITE || !BO || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('SITE, BO, SUPABASE_URL et SUPABASE_ANON_KEY sont requis')
  process.exit(1)
}

async function sessionCookie(email, cookieName) {
  const jar = new Map()
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: { name: cookieName },
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (c) => c.forEach(({ name, value }) => jar.set(name, value)) },
  })
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`${email} : ${error.message}`)
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ')
}

let failures = 0
async function check(base, path, cookie, expect = 'ok') {
  const res = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
  const location = res.headers.get('location') ?? ''
  const body = res.status === 200 ? await res.text() : ''
  let verdict
  if (expect === 'denied') verdict = res.status >= 300 && res.status < 400 && location.includes('acces-refuse') ? 'ok' : 'FAIL'
  else if (expect === 'notfound') verdict = res.status === 404 ? 'ok' : 'FAIL'
  else verdict = res.status === 200 && !/Application error|Internal Server Error/.test(body) ? 'ok' : 'FAIL'
  if (verdict !== 'ok') failures++
  console.log(`${verdict.padEnd(4)} ${res.status} ${base.replace(/^https:\/\//, '').split('.')[0]}${path}${location ? ` → ${location}` : ''}`)
  return body
}

const STAFF = {
  'direction@hitravel.test': ['/', '/aujourdhui', '/modules/hotel_tn', '/modules/mice', '/crm/demandes', '/crm/clients', '/devis', '/dossiers', '/departs',
    '/fournisseurs', '/finances/factures', '/finances/reglements', '/finances/tresorerie', '/finances/fournisseurs', '/comptabilite', '/alertes',
    '/documents', '/taches', '/taches/calendrier', '/site/offres', '/site/pages', '/integrations/hotels', '/integrations/imports', '/rapports', '/parametres'],
  'commercial@hitravel.test': ['/', '/crm/demandes', '/devis', '/dossiers'],
  'operations@hitravel.test': ['/', '/aujourdhui', '/dossiers', '/departs', '/integrations/imports'],
  'finance@hitravel.test': ['/', '/finances/factures', '/finances/reglements', '/comptabilite', '/rapports'],
  'site@hitravel.test': ['/site/offres'],
}

for (const path of ['/', '/offres', '/offres/istanbul-8-jours', '/omra', '/activites/visa', '/activites/evenements-mice', '/hotels', '/agence', '/contact', '/espace-client/connexion']) {
  await check(SITE, path)
}
for (const [email, routes] of Object.entries(STAFF)) {
  const cookie = await sessionCookie(email, 'sb-hi-bo-auth')
  for (const r of routes) await check(BO, r, cookie)
  if (email === 'site@hitravel.test') for (const r of ['/finances/factures', '/dossiers', '/comptabilite']) await check(BO, r, cookie, 'denied')
}
const client = await sessionCookie('client@hitravel.test', 'sb-hi-site-auth')
const home = await check(SITE, '/espace-client', client)
console.log(home.includes('DOS-2026-00001') ? 'ok   client voit DOS-2026-00001' : (failures++, 'FAIL client ne voit pas son dossier'))
const client2 = await sessionCookie('client2@hitravel.test', 'sb-hi-site-auth')
const home2 = await check(SITE, '/espace-client', client2)
console.log(!home2.includes('DOS-2026-00001') ? 'ok   client2 ne voit pas DOS-2026-00001' : (failures++, 'FAIL fuite entre clients'))

console.log(failures ? `\n${failures} échec(s)` : '\nTout est conforme')
process.exit(failures ? 1 : 0)
