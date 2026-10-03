import { expect, test } from '@playwright/test'
import { expectNoErrorPage, SITE } from './helpers'

test.describe('Site public (FO01–FO05)', () => {
  test('accueil, catalogue et 9 activités', async ({ page }) => {
    await page.goto(SITE)
    await expect(page.getByRole('link', { name: /demander un devis/i }).first()).toBeVisible()
    await page.goto(`${SITE}/offres`)
    await expect(page.getByTestId('offer-results')).toContainText('Istanbul')
    await expect(page.getByTestId('offer-results')).not.toContainText('printemps 2025')
    for (const slug of ['hotels-tunisie', 'hotels-etranger', 'voyages-a-la-carte', 'voyages-organises', 'visa', 'billetterie', 'circuits', 'transport', 'evenements-mice']) {
      const res = await page.goto(`${SITE}/activites/${slug}`)
      expect(res?.status(), slug).toBe(200)
      await expectNoErrorPage(page)
    }
    expect((await page.goto(`${SITE}/omra`))?.status()).toBe(200)
  })

  test('REC49 : prix, base et acompte distincts ; départ expiré non réservable', async ({ page }) => {
    await page.goto(`${SITE}/offres/istanbul-8-jours`)
    await expect(page.getByTestId('price-basis')).toContainText(/par personne/i)
    await expect(page.getByTestId('deposit-block')).toContainText('500')
    await expect(page.getByTestId('price-amount').first()).toContainText('2')
    // Départ du 12/09/2026 expiré : affiché, mais sans lien de réservation
    const expired = page.locator('[data-testid="departures-table"] tr[data-availability="expired"]')
    await expect(expired).toHaveCount(1)
    await expect(expired.getByRole('link')).toHaveCount(0)
    await expect(page.locator('[data-testid="departures-table"] tr[data-availability="bookable"]').first().getByRole('link')).toBeVisible()
  })

  test('REC48 : demande de devis reliée au CRM avec référence', async ({ page }) => {
    await page.goto(`${SITE}/offres/istanbul-8-jours`)
    const form = page.locator('form').filter({ has: page.locator('input[name="processing_consent"]') }).first()
    await form.locator('input[name="first_name"]').fill('Salma')
    await form.locator('input[name="last_name"]').fill('E2E Testeur')
    await form.locator('input[name="email"]').fill(`salma.e2e.${Date.now()}@example.test`)
    await form.locator('input[name="phone"]').fill('+216 20 000 001')
    await form.locator('input[name="processing_consent"]').check()
    await form.locator('button[type="submit"]').click()
    await expect(page.getByTestId('request-reference')).toHaveText(/^DEM-\d{4}-\d{5}$/)
    await expect(page.locator('body')).toContainText(/ne confirme pas|pas une réservation|n’est pas une confirmation/i)
  })

  test('REC24 : recherche hôtels sur les deux API', async ({ page }) => {
    await page.goto(`${SITE}/hotels?city=Hammamet&checkIn=2027-07-10&checkOut=2027-07-17&adults=2&children=0&rooms=1`)
    const submit = page.getByRole('button', { name: /rechercher/i })
    if (await submit.isVisible()) await submit.click()
    await expect(page.getByTestId('hotel-results')).toBeVisible()
    await expect(page.getByTestId('freshness').first()).toBeVisible()
    // Deux fournisseurs présentés séparément (noms commerciaux non exposés), taxes différentes visibles
    await expect(page.getByTestId('hotel-results')).toContainText('Tarif partenaire A')
    await expect(page.getByTestId('hotel-results')).toContainText('Tarif partenaire B')
    await expect(page.getByTestId('hotel-results')).toContainText('Taxe de séjour en sus')
  })
})
