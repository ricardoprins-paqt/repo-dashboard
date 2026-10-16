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

  await page.getByRole('group', { name: 'Filter repositories' }).getByRole('button', { name: /^Needs attention/ }).click()
  await expect(page.getByRole('group', { name: 'Filter repositories' }).getByRole('button', { name: 'Needs attention (selected)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open details for gadgets' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open details for widgets' })).toBeVisible()

  await page.getByRole('group', { name: 'Filter repositories' }).getByRole('button', { name: /^All/ }).click()
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

test('shows an alert callout when the overview cannot be loaded, and lets you dismiss it', async ({ page }) => {
  await page.route('**/api/repos**', route => route.fulfill({ status: 500, json: { statusMessage: 'git is not installed' } }))
  await page.goto('/')

  const callout = page.locator('pds-exp-callout')
  await expect(callout).toBeVisible()
  await expect(callout).toContainText('Could not load the overview')
  await expect(callout).toContainText('git is not installed')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  // Nothing to summarize yet, so no endless skeletons or zero counts.
  await expect(page.getByRole('heading', { name: /^Repositories/ })).toHaveCount(0)

  await page.getByRole('button', { name: /close|dismiss/i }).click()
  await expect(callout).toHaveCount(0)
})

test('opens the detail panel from anywhere on a card', async ({ page }) => {
  await page.goto('/')
  const card = page.locator('pds-card').filter({ hasText: 'widgets' })
  await expect(card).toBeVisible()

  // The repo name button is stretched over the whole card, so other content is covered by it
  // and Playwright would refuse to click it. Click at the footer's position, like a user would.
  await card.scrollIntoViewIfNeeded()
  const footer = await card.getByText('Initial commit').boundingBox()
  expect(footer).not.toBeNull()
  await page.mouse.click(footer!.x + footer!.width / 2, footer!.y + footer!.height / 2)
  await expect(page.locator('pds-slideover')).toContainText('/work/widgets')
})

test('switches between light and dark mode and remembers the choice', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const html = page.locator('html')

  await page.goto('/')
  await expect(html).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()

  // The head script applies the stored choice before the first paint, and hydration still agrees.
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()

  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
  expect(errors).toEqual([])
})

test.describe('with an OS that prefers dark', () => {
  test.use({ colorScheme: 'dark' })

  test('starts in dark mode when nothing is stored', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})

test('serves the page shell from the server before hydration', async ({ request }) => {
  const response = await request.get('/')

  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('Repo dashboard')
  expect(html).toContain('aria-label="Loading repositories"')
})
