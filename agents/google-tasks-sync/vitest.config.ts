import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Loaded before every test file: starts the mock network and makes any
    // un-faked request an error.
    setupFiles: ['./tests/mocks/server.ts'],
    env: {
      // Deliberately fake. If the SDK ever fell back to a real token from
      // `zapier-sdk login`, these override it — a test run cannot authenticate
      // against real Zapier even on a laptop that's logged in.
      ZAPIER_CREDENTIALS_CLIENT_ID: 'test-client-id',
      ZAPIER_CREDENTIALS_CLIENT_SECRET: 'test-client-secret',
    },
  },
})
