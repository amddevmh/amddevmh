// (Re)charge les données de démonstration dans un environnement de RECETTE.
//
//   node scripts/demo-data.mjs --local --yes                  pile Supabase locale (supabase start)
//   SUPABASE_ACCESS_TOKEN=… node scripts/demo-data.mjs --project <ref> --yes
//
// Étapes : vidage du bucket « documents » → remise à zéro (supabase/demo/reset.sql) → seed de base
// (supabase/seed.sql) → pack de démonstration (supabase/demo/demo.sql) → dépôt de PDF factices
// pour chaque document → résumé. Le SQL s'exécute en une seule transaction.
//
// Garde-fou : un projet distant n'est accepté que si son nom contient « staging ».
// La production n'est jamais visée par ce script.
import { execFileSync, execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const local = args.includes('--local')
const ref = args[args.indexOf('--project') + 1]
const confirmed = args.includes('--yes')
const FILES = ['supabase/demo/reset.sql', 'supabase/seed.sql', 'supabase/demo/demo.sql']

function fail(msg) {
  console.error(`✖ ${msg}`)
  process.exit(1)
}

if (!local && (!args.includes('--project') || !ref || ref.startsWith('--'))) {
  fail('Préciser --local ou --project <ref> (ex. node scripts/demo-data.mjs --project icvgzesvolslzqitxndj --yes)')
}

// ---------------------------------------------------------------------------
// Cible : exécution SQL + accès Storage
// ---------------------------------------------------------------------------
let target
if (local) {
  const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  target = {
    label: 'pile locale',
    storageUrl: status.API_URL,
    serviceKey: status.SERVICE_ROLE_KEY,
    runSql: (files) => execFileSync('psql', [status.DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-1', ...files.flatMap((f) => ['-f', f])], { stdio: ['ignore', 'ignore', 'inherit'] }),
    query: (sql) => JSON.parse(execFileSync('psql', [status.DB_URL, '-At', '-c', `select coalesce(json_agg(t), '[]') from (${sql}) t`], { encoding: 'utf8' })),
    exec: (sql) => execFileSync('psql', [status.DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: ['ignore', 'ignore', 'inherit'] }),
  }
} else {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) fail('SUPABASE_ACCESS_TOKEN manquant')
  const api = (path, init = {}) =>
    fetch(`https://api.supabase.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } })
  const project = await (await api(`/projects/${ref}`)).json()
  if (!project?.name) fail(`Projet ${ref} introuvable ou inaccessible`)
  if (!/staging/i.test(project.name)) fail(`Refus : le projet « ${project.name} » n'est pas un environnement de recette (son nom doit contenir « staging »).`)
  const keys = await (await api(`/projects/${ref}/api-keys?reveal=true`)).json()
  const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key
  if (!serviceKey) fail('Clé service introuvable')
  const runQuery = async (sql) => {
    const res = await api(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query: sql }) })
    const text = await res.text()
    if (!res.ok) throw new Error(`${res.status} ${text}`)
    return JSON.parse(text || '[]')
  }
  target = {
    label: `projet ${project.name} (${ref})`,
    storageUrl: `https://${ref}.supabase.co`,
    serviceKey,
    runSql: async (files) => runQuery(`begin;\n${files.map((f) => readFileSync(f, 'utf8')).join('\n;\n')}\ncommit;`),
    query: runQuery,
    exec: runQuery,
  }
}

if (!confirmed) {
  console.log(`Cible : ${target.label}`)
  console.log('Cette opération EFFACE toutes les données métier et tous les comptes, puis recharge la démonstration.')
  console.log('Relancer avec --yes pour confirmer.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Storage (API, avec la clé service)
// ---------------------------------------------------------------------------
const storageHeaders = { Authorization: `Bearer ${target.serviceKey}`, apikey: target.serviceKey }

async function listAll(bucket, prefix = '') {
  const res = await fetch(`${target.storageUrl}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { ...storageHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  })
  if (!res.ok) throw new Error(`Liste ${bucket}/${prefix} : ${res.status} ${await res.text()}`)
  const out = []
  for (const item of await res.json()) {
    const path = `${prefix}${item.name}`
    if (item.id) out.push(path)
    else out.push(...(await listAll(bucket, `${path}/`)))
  }
  return out
}

async function emptyBucket(bucket) {
  const paths = await listAll(bucket)
  for (let i = 0; i < paths.length; i += 100) {
    const res = await fetch(`${target.storageUrl}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { ...storageHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
    })
    if (!res.ok) throw new Error(`Suppression ${bucket} : ${res.status} ${await res.text()}`)
  }
  return paths.length
}

async function upload(bucket, path, bytes) {
  const res = await fetch(`${target.storageUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...storageHeaders, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: bytes,
  })
  if (!res.ok) throw new Error(`Dépôt ${path} : ${res.status} ${await res.text()}`)
}

// ---------------------------------------------------------------------------
// PDF minimal (une page, Helvetica, encodage WinAnsi)
// ---------------------------------------------------------------------------
function pdf(title, lines) {
  const latin = (s) => s.replace(/[’‘]/g, "'").replace(/[—–]/g, '-').replace(/…/g, '...').replace(/⇄/g, '<->').replace(/[^\x20-\xff]/g, '?')
  const esc = (s) => latin(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const body = [
    'BT /F2 20 Tf 0.06 0.31 0.62 rg 56 770 Td (HI Travel) Tj ET',
    `BT /F2 15 Tf 0.07 0.1 0.28 rg 56 730 Td (${esc(title)}) Tj ET`,
    ...lines.map((l, i) => `BT /F1 11 Tf 0.13 0.15 0.16 rg 56 ${700 - i * 18} Td (${esc(l)}) Tj ET`),
    'BT /F1 9 Tf 0.36 0.39 0.45 rg 56 60 Td (Document de demonstration - environnement de recette, donnees fictives.) Tj ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
console.log(`→ ${target.label}`)
const removed = await emptyBucket('documents')
console.log(`  bucket « documents » vidé (${removed} fichier(s))`)

await target.runSql(FILES)
console.log('  base remise à zéro, seed et pack de démonstration chargés')

const docs = await target.query(`
  select d.storage_path, d.title, d.kind::text as kind, d.size_bytes, ds.reference, c.display_name as client
    from public.documents d
    left join public.dossiers ds on ds.id = d.dossier_id
    left join public.clients c on c.id = d.client_id
   order by d.created_at`)
const sizes = []
for (const d of docs) {
  const bytes = pdf(d.title, [
    `Type : ${d.kind}`,
    d.reference ? `Dossier : ${d.reference}` : 'Dossier : -',
    d.client ? `Client : ${d.client}` : '',
    `Fichier : ${d.storage_path}`,
  ].filter(Boolean))
  await upload('documents', d.storage_path, bytes)
  sizes.push(`('${d.storage_path.replaceAll("'", "''")}', ${bytes.length})`)
}
// La taille enregistrée correspond au fichier déposé
if (sizes.length) {
  await target.exec(`update public.documents d set size_bytes = v.s from (values ${sizes.join(', ')}) v(p, s) where d.storage_path = v.p`)
}
console.log(`  ${docs.length} document(s) PDF déposé(s)`)

const summary = await target.query(`
  select (select count(*) from public.dossiers) as dossiers, (select count(*) from public.quotes) as devis,
         (select count(*) from public.invoices) as factures, (select count(*) from public.payments) as reglements,
         (select count(*) from public.journal_entries where status = 'posted') as ecritures_validees,
         (select count(*) from public.tasks) as taches, (select count(*) from public.alerts) as alertes,
         (select count(*) from auth.users) as comptes`)
console.log('  résumé :', summary[0])
console.log('✓ Données de démonstration prêtes (mot de passe des comptes : HiTravel2026!)')
