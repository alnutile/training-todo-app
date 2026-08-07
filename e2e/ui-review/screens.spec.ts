/**
 * The UI review pass: sign in for real, drive the app, photograph it.
 *
 * Nothing is mocked here. Real Supabase Auth issues the session, real Postgres
 * stores the cards, real Row Level Security decides what comes back. That makes
 * this the only suite that can catch an auth-config mistake or a broken policy
 * — the mocked e2e suite structurally cannot.
 *
 * Each screenshot is captured with a filename the reviewer reads as context
 * (see scripts/ui-review/lib.mjs), so "what is this meant to look like?" is
 * answered by the name rather than a separate manifest.
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { REVIEW_EMAIL, REVIEW_PASSWORD, SHOT_DIR } from './fixtures'

test.beforeAll(async () => {
  await mkdir(SHOT_DIR, { recursive: true })
})

/** Screenshot the whole page, including anything below the fold. */
async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true })
}

async function signIn(page: Page) {
  await page.getByLabel('Email').fill(REVIEW_EMAIL)
  await page.getByLabel('Password').fill(REVIEW_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Wait for the board, not a timeout — the four lanes only render post-session.
  await expect(page.getByText('In Progress', { exact: true })).toBeVisible()
}

/** Remove every card, so each test starts from a known board. */
async function clearBoard(page: Page) {
  for (;;) {
    const deletes = page.getByRole('button', { name: /^Delete / })
    if ((await deletes.count()) === 0) break
    await deletes.first().click()
    await expect(deletes).toHaveCount((await deletes.count()) - 1, { timeout: 5000 }).catch(() => {})
  }
}

test.describe.configure({ mode: 'serial' })

test('login screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'To-Do' })).toBeVisible()

  await shoot(page, 'login-screen')
})

test('empty board, freshly signed in', async ({ page }) => {
  await page.goto('/')
  await signIn(page)
  await clearBoard(page)

  await expect(page.getByText('0 of 0 tasks complete · 0% done')).toBeVisible()

  await shoot(page, 'board-empty')
})

test('board with cards across lanes', async ({ page }) => {
  await page.goto('/')
  await signIn(page)
  await clearBoard(page)

  // Real inserts, through RLS, with the session's own JWT.
  for (const [lane, title] of [
    ['Backlog', 'Write the script'],
    ['Backlog', 'Book the studio'],
    ['Next', 'Record the intro'],
    ['In Progress', 'Edit chapter one'],
  ] as const) {
    await page.getByLabel(`Add a task to ${lane}`).fill(title)
    await page.getByRole('button', { name: `Add to ${lane}` }).click()
    await expect(page.getByText(title)).toBeVisible()
  }

  // Tick one so the progress bar has something to show.
  await page.getByRole('button', { name: 'Mark Edit chapter one done' }).click()
  await expect(page.getByText('1 of 4 tasks complete · 25% done')).toBeVisible()

  await shoot(page, 'board-with-cards')
})

test('validation message on an empty title', async ({ page }) => {
  await page.goto('/')
  await signIn(page)

  await page.getByRole('button', { name: 'Add to Backlog' }).click()
  await expect(page.getByRole('alert')).toBeVisible()

  await shoot(page, 'board-validation-error')
})

test('sign-in error on a wrong password', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill(REVIEW_EMAIL)
  await page.getByLabel('Password').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Real Supabase Auth rejecting real credentials.
  await expect(page.getByText(/Invalid login credentials/i)).toBeVisible()

  await shoot(page, 'login-error')
})
