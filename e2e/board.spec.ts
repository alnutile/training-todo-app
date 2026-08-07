/**
 * The "is it actually still a working app?" test.
 *
 * A real Chrome loads the real production bundle and clicks real buttons. This
 * is the one that catches the things a unit test cannot: a component that
 * crashes on mount, a login screen that never hands over to the board, a button
 * that quietly disappeared in a redesign.
 */
import { expect, test } from '@playwright/test'
import { mockSupabase, TEST_EMAIL } from './fake-supabase'

const PASSWORD = 'hunter2!'

/** Sign in and land on the board. */
async function signIn(page: import('@playwright/test').Page) {
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a logged-out visitor gets the login screen, not the board', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'To-Do' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  // The board must not be reachable without a session.
  await expect(page.getByText('In Progress')).toHaveCount(0)
})

test('signing in shows the board with all four lanes', async ({ page }) => {
  await mockSupabase(page, [
    { title: 'Write the script', status: 'backlog' },
    { title: 'Record the video', status: 'in_progress' },
    { title: 'Buy a microphone', status: 'done' },
  ])
  await page.goto('/')
  await signIn(page)

  for (const lane of ['Backlog', 'Next', 'In Progress', 'Done']) {
    await expect(page.getByText(lane, { exact: true })).toBeVisible()
  }

  await expect(page.getByText('Write the script')).toBeVisible()
  await expect(page.getByText('Record the video')).toBeVisible()
  await expect(page.getByText('1 of 3 tasks complete · 33% done')).toBeVisible()
  await expect(page.getByText(TEST_EMAIL)).toBeVisible()
})

test('adding a card persists it to the database', async ({ page }) => {
  const supabase = await mockSupabase(page, [])
  await page.goto('/')
  await signIn(page)

  await page.getByLabel('Add a task to Next').fill('Book the studio')
  await page.getByRole('button', { name: 'Add to Next' }).click()

  await expect
    .poll(() => supabase.writes().length, { message: 'expected one insert' })
    .toBe(1)
  expect(supabase.writes()[0]).toMatchObject({
    method: 'POST',
    body: { title: 'Book the studio', status: 'next' },
  })
})

test('an empty title is refused before it reaches the database', async ({ page }) => {
  const supabase = await mockSupabase(page, [])
  await page.goto('/')
  await signIn(page)

  await page.getByRole('button', { name: 'Add to Backlog' }).click()

  await expect(page.getByRole('alert')).toContainText(/title/i)
  expect(supabase.writes()).toHaveLength(0)
})

test('checking a card moves it into Done', async ({ page }) => {
  const supabase = await mockSupabase(page, [{ title: 'Finish the edit', status: 'backlog' }])
  await page.goto('/')
  await signIn(page)

  await page.getByRole('button', { name: 'Mark Finish the edit done' }).click()

  await expect(page.getByText('1 of 1 tasks complete · 100% done')).toBeVisible()
  await expect.poll(() => supabase.writes().length).toBe(1)
  expect(supabase.writes()[0]).toMatchObject({ method: 'PATCH', body: { status: 'done' } })
})

test('deleting a card takes it off the board', async ({ page }) => {
  await mockSupabase(page, [{ title: 'Scrap this', status: 'backlog' }])
  await page.goto('/')
  await signIn(page)

  await expect(page.getByText('Scrap this')).toBeVisible()
  await page.getByRole('button', { name: 'Delete Scrap this' }).click()

  await expect(page.getByText('Scrap this')).toHaveCount(0)
})

test('the footer shows the deployed commit and links to it', async ({ page }) => {
  await mockSupabase(page, [])
  await page.goto('/')

  const footer = page.locator('.site-footer')
  await expect(footer).toBeVisible()

  // The sha is baked in at build time, so we assert on the shape, not a value.
  const link = footer.getByRole('link')
  await expect(link).toHaveAttribute('href', /github\.com\/alnutile\/training-todo-app/)
  await expect(link).toHaveText(/^[0-9a-f]{7}$|^dev$/)

  // And it's there once you're signed in too, not just on the login screen.
  await signIn(page)
  await expect(page.locator('.site-footer')).toBeVisible()
})

test('signing out returns you to the login screen', async ({ page }) => {
  await mockSupabase(page, [{ title: 'Private task' }])
  await page.goto('/')
  await signIn(page)

  await expect(page.getByText('Private task')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByText('Private task')).toHaveCount(0)
})
