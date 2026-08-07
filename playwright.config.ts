import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: a real Chrome, driving the real production build.
 *
 * `npm run build` runs first, then the built files are served exactly as
 * Railway serves them. The only fake is Supabase — see e2e/fake-supabase.ts.
 * That keeps the suite fast and free, and means it passes on a laptop, in CI,
 * and at 2am when the database is down for maintenance.
 */
const PORT = 4173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Baked into the bundle at build time. Fake on purpose — and public by
      // definition, because anything VITE_ ships to the browser.
      VITE_SUPABASE_URL: 'https://fake-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_key',
    },
  },
})
