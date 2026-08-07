import { defineConfig, devices } from '@playwright/test'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from './e2e/ui-review/fixtures'

/**
 * The UI review suite — deliberately NOT mocked.
 *
 * playwright.config.ts fakes Supabase so the functional e2e suite is fast and
 * free. This one does the opposite: it points the real build at a real, local
 * Supabase so the screenshots show the app as a person would actually meet it,
 * and so an auth-config or RLS mistake has somewhere to surface.
 *
 * Needs `supabase start` running. See docs/ci-cd.md.
 */
const PORT = 4174
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/ui-review',
  globalSetup: './e2e/ui-review/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: BASE_URL,
    // A stable viewport keeps screenshots comparable between runs.
    viewport: { width: 1440, height: 900 },
    screenshot: 'off',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: LOCAL_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    },
  },
})
