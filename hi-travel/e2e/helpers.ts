import { expect, type Page } from '@playwright/test'

// Par défaut : builds locaux. Pour viser un environnement déployé (ex. staging Railway) :
// E2E_SITE_URL=https://… E2E_BACKOFFICE_URL=https://… pnpm test:e2e
export const SITE = process.env.E2E_SITE_URL ?? 'http://localhost:3000'
export const BO = process.env.E2E_BACKOFFICE_URL ?? 'http://localhost:3001'
export const PASSWORD = 'HiTravel2026!'

export async function staffLogin(page: Page, email: string) {
  await page.goto(`${BO}/login`)
  await page.fill('#email', email)
  await page.fill('#password', PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

export async function clientLogin(page: Page, email: string) {
  await page.goto(`${SITE}/espace-client/connexion`)
  await page.getByLabel(/e-mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).first().fill(PASSWORD)
  await page.getByRole('button', { name: /se connecter/i }).click()
  await expect(page).toHaveURL(/\/espace-client(\/)?$/)
}

/** Accepte les confirmations natives (actions engageantes). */
export function acceptDialogs(page: Page) {
  page.on('dialog', (d) => d.accept())
}

/** Aucune page d'erreur Next.js rendue. */
export async function expectNoErrorPage(page: Page) {
  await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error|Internal Server Error/)
}
