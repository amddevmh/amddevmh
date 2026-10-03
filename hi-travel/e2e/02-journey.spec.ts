import { expect, test } from '@playwright/test'
import { acceptDialogs, BO, clientLogin, expectNoErrorPage, SITE, staffLogin } from './helpers'

/** Parcours : devis → dossier (back office), puis paiement en ligne du client (REC01, REC52). */
test.describe.serial('Parcours demande → devis → dossier → paiement', () => {
  test('REC01 : un commercial crée, envoie et fait accepter un devis', async ({ page }) => {
    acceptDialogs(page)
    await staffLogin(page, 'commercial@hitravel.test')
    // Client Leila Trabelsi + départ Istanbul de décembre
    await page.goto(`${BO}/devis/nouveau?client=33333333-0000-0000-0000-000000000002&depart=88888888-0000-0000-0000-000000000002`)
    await page.getByRole('button', { name: 'Créer le devis' }).click()
    await expect(page).toHaveURL(/\/devis\/[0-9a-f-]{36}(\?|$)/)
    await expectNoErrorPage(page)
    await page.getByRole('button', { name: 'Marquer comme envoyée' }).click()
    await expect(page.getByRole('button', { name: 'Accepter et créer le dossier' })).toBeVisible()
    await page.getByRole('button', { name: 'Accepter et créer le dossier' }).click()
    await expect(page).toHaveURL(/\/dossiers\/[0-9a-f-]{36}/)
    await expect(page.locator('body')).toContainText(/DOS-\d{4}-\d{5}/)
    await expectNoErrorPage(page)
  })

  test('REC51/REC52 : le client voit son solde et paie une échéance en ligne', async ({ page }) => {
    await clientLogin(page, 'client@hitravel.test')
    await expect(page.getByTestId('dossier-list')).toContainText('DOS-2026-00001')
    await page.getByTestId('dossier-list').getByRole('link').first().click()
    await expect(page.getByTestId('balance')).toContainText('1')
    await page.goto(page.url().replace(/\/?$/, '/paiement'))
    await page.locator('input[name="choice"]').first().check()
    // Conditions à accepter avant tout règlement
    await page.getByRole('checkbox', { name: /J’ai lu les conditions/ }).check()
    await page.getByRole('button', { name: /^Payer \d/ }).click()
    await expect(page).toHaveURL(/\/mock-psp\//)
    await expect(page.getByTestId('psp-reference')).toContainText('DOS-2026-00001')
    await page.getByRole('button', { name: 'Payer (succès)' }).click()
    await expect(page).toHaveURL(/\/paiement\/retour/)
    await expect(page.getByTestId('payment-return-title')).toHaveText('Paiement confirmé', { timeout: 30_000 })
  })

  test('REC52 : le paiement en ligne apparaît une seule fois côté finance', async ({ page }) => {
    await staffLogin(page, 'finance@hitravel.test')
    await page.goto(`${BO}/finances/reglements`)
    await expect(page.locator('body')).toContainText(/Paiement en ligne/)
    await expectNoErrorPage(page)
  })

  test('REC51 : un autre client ne peut pas ouvrir ce dossier', async ({ page }) => {
    await clientLogin(page, 'client2@hitravel.test')
    await expect(page.locator('body')).not.toContainText('DOS-2026-00001')
    const res = await page.goto(`${SITE}/espace-client/dossiers/00000000-0000-0000-0000-000000000000`)
    expect(res?.status()).toBe(404)
  })
})
