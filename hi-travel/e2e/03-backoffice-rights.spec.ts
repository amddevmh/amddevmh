import { expect, test } from '@playwright/test'
import { BO, expectNoErrorPage, staffLogin } from './helpers'

const ROUTES: Record<string, string[]> = {
  'direction@hitravel.test': [
    '/', '/aujourdhui', '/modules/hotel_tn', '/modules/visa', '/modules/mice', '/crm/demandes', '/crm/clients', '/devis', '/dossiers',
    '/departs', '/fournisseurs', '/finances/factures', '/finances/reglements', '/finances/tresorerie', '/finances/fournisseurs',
    '/comptabilite', '/alertes', '/documents', '/taches', '/taches/calendrier', '/site/offres', '/site/pages',
    '/integrations/hotels', '/integrations/imports', '/rapports', '/parametres',
  ],
  'operations@hitravel.test': ['/', '/aujourdhui', '/dossiers', '/departs', '/fournisseurs', '/integrations/imports', '/taches'],
  'finance@hitravel.test': ['/', '/finances/factures', '/finances/reglements', '/comptabilite', '/rapports'],
}

test.describe('Back office : pages par rôle et droits (section 3, REC06)', () => {
  for (const [email, routes] of Object.entries(ROUTES)) {
    test(`${email} ouvre ses écrans sans erreur`, async ({ page }) => {
      await staffLogin(page, email)
      for (const route of routes) {
        const res = await page.goto(`${BO}${route}`)
        expect(res?.status(), route).toBeLessThan(400)
        await expect(page, route).not.toHaveURL(/acces-refuse|login/)
        await expectNoErrorPage(page)
      }
    })
  }

  test('le dossier de référence affiche ses onglets', async ({ page }) => {
    await staffLogin(page, 'commercial@hitravel.test')
    await page.goto(`${BO}/dossiers`)
    await page.getByRole('link', { name: 'DOS-2026-00001' }).first().click()
    await expect(page.locator('body')).toContainText('Istanbul')
    await expectNoErrorPage(page)
  })

  test('REC06 : le profil site n’accède ni aux finances, ni aux dossiers, ni aux marges', async ({ page }) => {
    await staffLogin(page, 'site@hitravel.test')
    for (const route of ['/finances/factures', '/dossiers', '/comptabilite', '/parametres']) {
      await page.goto(`${BO}${route}`)
      await expect(page, route).toHaveURL(/acces-refuse/)
    }
    await page.goto(`${BO}/site/offres`)
    await expect(page).not.toHaveURL(/acces-refuse/)
    await expect(page.locator('nav[aria-label="Navigation principale"]').first()).not.toContainText('Finances')
  })
})
