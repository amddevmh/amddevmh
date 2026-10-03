// Écrit apps/*/.env.local à partir de la pile Supabase locale (`supabase status`).
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
const secretFile = '.payment-secret.local'
const paymentSecret = existsSync(secretFile) ? readFileSync(secretFile, 'utf8').trim() : randomBytes(24).toString('hex')
writeFileSync(secretFile, paymentSecret)

const common = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  NEXT_PUBLIC_BACKOFFICE_URL: 'http://localhost:3001',
  PAYMENT_WEBHOOK_SECRET: paymentSecret,
  INTEGRATIONS_MODE: 'mock',
}
for (const app of ['site', 'backoffice']) {
  const env = { ...common, NEXT_PUBLIC_AUTH_COOKIE_NAME: app === 'site' ? 'sb-hi-site-auth' : 'sb-hi-bo-auth' }
  writeFileSync(`apps/${app}/.env.local`, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
  console.log(`apps/${app}/.env.local écrit`)
}
