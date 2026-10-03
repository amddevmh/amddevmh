import { defineConfig } from '@playwright/test'

/**
 * Parcours de bout en bout sur les builds de production des deux applications,
 * contre la pile Supabase locale réinitialisée (`pnpm db:reset`).
 * Préalable : `pnpm env:local && pnpm build`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    locale: 'fr-FR',
    timezoneId: 'Africa/Tunis',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Uniquement derrière un proxy TLS d'inspection (bac à sable) : E2E_IGNORE_HTTPS_ERRORS=1
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === '1',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      // Bac à sable derrière un proxy d'inspection : HTTP/1.1 uniquement
      args: process.env.E2E_IGNORE_HTTPS_ERRORS === '1' ? ['--disable-http2', '--disable-quic'] : [],
    },
  },
  // Serveurs locaux uniquement si aucun environnement distant n'est visé
  webServer: process.env.E2E_SITE_URL ? undefined : [
    { command: 'pnpm --filter @hi/site start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm --filter @hi/backoffice start', url: 'http://localhost:3001/login', reuseExistingServer: true, timeout: 120_000 },
  ],
})
