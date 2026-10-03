// Vérification d'un environnement déployé sans navigateur : connexion Supabase (cookie de session
// au format @supabase/ssr), puis chaque écran par rôle → statut HTTP, redirections, page d'erreur.
// Usage : SITE=https://… BO=https://… SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=… node scripts/smoke-deployed.mjs [--demo]
// --demo : contrôles supplémentaires sur le pack de démonstration (chaque dossier et ses onglets,
//          téléchargements de documents, compte client3, écrans non vides).
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

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

if (process.argv.includes('--demo')) {
  console.log('\n— Pack de démonstration —')
  const api = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  await api.auth.signInWithPassword({ email: 'direction@hitravel.test', password: PASSWORD })
  const { data: dossiers } = await api.from('dossiers').select('id, reference, activity').order('reference')
  const dir = await sessionCookie('direction@hitravel.test', 'sb-hi-bo-auth')
  for (const d of dossiers ?? []) {
    const tabs = ['', '/prestations', '/voyageurs', '/paiements', '/documents', '/taches', '/controle', '/echeances', '/incidents', '/historique',
      ...(d.activity === 'mice' ? ['/participants'] : [])]
    let ok = 0
    for (const t of tabs) {
      const res = await fetch(`${BO}/dossiers/${d.id}${t}`, { headers: { cookie: dir }, redirect: 'manual' })
      const body = res.status === 200 ? await res.text() : ''
      if (res.status === 200 && !/Application error|Internal Server Error/.test(body)) ok++
      else { failures++; console.log(`FAIL ${res.status} dossier ${d.reference}${t}`) }
    }
    console.log(`${ok === tabs.length ? 'ok  ' : 'FAIL'} ${d.reference} (${d.activity}) : ${ok}/${tabs.length} onglets`)
  }
  for (const [path, marker] of [['/finances/factures', 'FAC-'], ['/finances/reglements', 'Rejeté'], ['/comptabilite', 'OD-DEMO-01'],
    ['/alertes', 'Justifiée'], ['/integrations/imports', 'rapport-billetterie'], ['/aujourdhui', 'Urgent'], ['/devis', 'Dubaï'],
    ['/crm/demandes', 'Gagnée'], ['/modules/transport', 'TU-5521'], ['/rapports', 'Voyages organisés']]) {
    const body = await check(BO, path, dir)
    if (!body.includes(marker)) { failures++; console.log(`FAIL ${path} ne contient pas « ${marker} »`) } else console.log(`ok   ${path} contient « ${marker} »`)
  }
  async function download(base, path, cookie, label) {
    const res = await fetch(base + path, { headers: { cookie }, redirect: 'manual' })
    const loc = res.headers.get('location')
    const file = loc ? await fetch(new URL(loc, base)) : null
    const head = file ? Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString() : ''
    const ok = res.status >= 300 && res.status < 400 && file?.status === 200 && head === '%PDF-'
    if (!ok) failures++
    console.log(`${ok ? 'ok  ' : 'FAIL'} téléchargement ${label} (${res.status} → ${file?.status ?? '-'})`)
  }
  const { data: docs } = await api.from('documents').select('id, title, client_id, published_to_client').order('created_at')
  const internal = docs?.find((x) => x.title.startsWith('Facture Tunisiabeds'))
  if (internal) await download(BO, `/api/documents/${internal.id}`, dir, `back office « ${internal.title} »`)
  const c3 = await sessionCookie('client3@hitravel.test', 'sb-hi-site-auth')
  const portal = await check(SITE, '/espace-client', c3)
  if (!/DOS-\d{4}-\d{5}/.test(portal)) { failures++; console.log('FAIL client3 ne voit pas son dossier') } else console.log('ok   client3 voit son dossier')
  const { data: c3docs } = await api.from('documents').select('id, title, clients!inner(email)').eq('clients.email', 'client3@hitravel.test').eq('published_to_client', true)
  if (c3docs?.[0]) await download(SITE, `/espace-client/documents/${c3docs[0].id}`, c3, `espace client « ${c3docs[0].title} »`)
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est conforme')
process.exit(failures ? 1 : 0)
