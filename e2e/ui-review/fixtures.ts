/**
 * Shared constants for the UI review run.
 *
 * The Supabase CLI's local stack uses the same URL and publishable key on every
 * machine, so these defaults work on a laptop and in CI without configuration.
 * The workflow still passes them explicitly, in case a future CLI changes them.
 */
export const LOCAL_SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'

export const LOCAL_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

/** The account the review signs in as. Seeded by global-setup.ts. */
export const REVIEW_EMAIL = 'ui-review@example.com'
export const REVIEW_PASSWORD = 'ui-review-password'

/** Where screenshots land for the reviewer to look at. */
export const SHOT_DIR = 'ui-review/screens'
