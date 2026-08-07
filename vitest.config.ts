import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom = a browser-shaped environment in Node. Fast enough to run on every
    // save; the real Chrome check lives in the Playwright suite (e2e/).
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    env: {
      // Fake, and public by design — these are the VITE_ vars, which always
      // reach the browser. The tests never talk to a real project; MSW answers
      // this host. The service_role key appears nowhere in this app.
      VITE_SUPABASE_URL: 'https://fake-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_key',
      // Pinned so the footer renders the same sha every run. The real value is
      // baked in at build time by vite.config.ts.
      VITE_COMMIT_SHA: 'abcdef1234567890abcdef1234567890abcdef12',
    },
  },
})
