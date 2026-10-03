// Applique les migrations (et, en option, le seed de démo) à un projet Supabase distant
// via l'API de gestion (HTTPS) — utile quand le port Postgres n'est pas joignable.
// Les migrations appliquées sont enregistrées dans supabase_migrations.schema_migrations,
// comme le ferait `supabase db push`.
//
// Usage : SUPABASE_ACCESS_TOKEN=… node scripts/apply-remote-sql.mjs <project-ref> [--seed]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [ref, ...flags] = process.argv.slice(2)
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!ref || !token) {
  console.error('Usage : SUPABASE_ACCESS_TOKEN=… node scripts/apply-remote-sql.mjs <project-ref> [--seed]')
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const lit = (s) => `'${s.replaceAll("'", "''")}'`

await query(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`)
const applied = new Set((await query('select version from supabase_migrations.schema_migrations')).map((r) => r.version))

const dir = 'supabase/migrations'
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const [version, ...rest] = file.replace(/\.sql$/, '').split('_')
  if (applied.has(version)) {
    console.log(`= ${file} (déjà appliquée)`)
    continue
  }
  const sql = readFileSync(join(dir, file), 'utf8')
  await query(`begin;\n${sql}\n;insert into supabase_migrations.schema_migrations (version, name, statements) values (${lit(version)}, ${lit(rest.join('_'))}, array[${lit(sql)}]);\ncommit;`)
  console.log(`+ ${file}`)
}

if (flags.includes('--seed')) {
  await query(readFileSync('supabase/seed.sql', 'utf8'))
  console.log('+ seed.sql (données de démonstration)')
}
