import { expect, test } from '@playwright/test'
import { ciExplanationFixture, ciOverviewFixture } from '../fixtures/ci'

test.beforeEach(async ({ page }) => {
  // Never call GitHub or Claude from a test.
  await page.route('**/api/ci', route => route.fulfill({ json: ciOverviewFixture }))
  await page.route('**/api/ci/runs/*/explanation', async (route) => {
    await new Promise(resolve => setTimeout(resolve, 300))
    await route.fulfill({ json: ciExplanationFixture })
  })
})

test('lists red workflows first with how long they have been red', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/ci')

  await expect(page.getByRole('heading', { name: 'CI', exact: true })).toBeVisible()
  const rows = page.locator('main li h3')
  await expect(rows.first()).toContainText('widgets')
  await expect(rows.nth(1)).toContainText('gadgets')
  await expect(page.getByText('Red for 1 day')).toBeVisible()
  await expect(page.getByText('33% slower than the 10 runs before')).toBeVisible()
  await expect(page.getByText('Last 3 runs: 1 passed, 2 failed, 0 running, 0 cancelled or skipped')).toBeAttached()
  await expect(page.getByText('Needs SSO authorisation for this organisation')).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('ci.png'), fullPage: true })
})

test('filters on red and searches', async ({ page }) => {
  await page.goto('/ci')
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await expect(page.locator('main li h3')).toHaveCount(1)
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search repo or workflow' }).fill('gadg')
  await expect(page.locator('main li h3')).toHaveCount(1)
  await expect(page.locator('main li h3')).toContainText('gadgets')
})

test('explains a failed run, marked as AI', async ({ page }) => {
  await page.goto('/ci')
  await page.getByRole('button', { name: 'Why did this fail?' }).click()
  await expect(page.getByText(/Claude is reading the failing step's log/)).toBeVisible()
  const panel = page.getByRole('region', { name: 'AI explanation of run 13' })
  await expect(panel).toContainText('AI explanation · check before acting')
  await expect(panel).toContainText('The new test runner no longer finds the setup file.')
  await expect(panel).toContainText('Code change')
  await expect(panel).toContainText('medium confidence')
})
