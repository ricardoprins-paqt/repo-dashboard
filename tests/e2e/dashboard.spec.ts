import { expect, test } from '@playwright/test'
import { overviewFixture } from '../fixtures/overview'

test.beforeEach(async ({ page }) => {
  // Never touch the real repositories from a test.
  await page.route('**/api/repos**', route => route.fulfill({ json: overviewFixture }))
})

test('shows the summary, the decision list and every repository', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Repo dashboard', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Repositories (2)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open details for widgets' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open details for gadgets' })).toBeVisible()

  const decisions = page.getByRole('region', { name: /What needs a decision/ })
  await expect(decisions).toContainText('CI is failing on develop')
  await expect(decisions).toContainText('2 commits not pushed')

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('dashboard.png'), fullPage: true })
})

test('filters and searches the repository list', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open details for gadgets' })).toBeVisible()

  await page.getByRole('button', { name: 'Needs attention', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open details for gadgets' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open details for widgets' })).toBeVisible()

  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search repo, branch or PR title' }).fill('gadg')
  await expect(page.getByRole('button', { name: 'Open details for widgets' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open details for gadgets' })).toBeVisible()
})

test('opens the detail panel with changes, pull requests and CI', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open details for widgets' }).click()

  const panel = page.locator('pds-slideover')
  await expect(panel).toContainText('/work/widgets')
  await expect(panel).toContainText('Needs attention')

  await page.getByRole('tab', { name: 'Changes' }).click()
  await expect(panel).toContainText('src/login.ts')
  await expect(panel).toContainText('Add login form')

  await page.getByRole('tab', { name: /PRs/ }).click()
  await expect(panel).toContainText('#12 Add login')

  await page.getByRole('tab', { name: 'CI' }).click()
  await expect(panel).toContainText('Failing')
})

test('serves the page shell from the server before hydration', async ({ request }) => {
  const response = await request.get('/')

  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('Repo dashboard')
  expect(html).toContain('aria-label="Loading repositories"')
})
