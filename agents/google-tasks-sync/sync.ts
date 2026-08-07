/**
 * Google Tasks -> todos sync agent (entry point).
 *
 * A per-user, server-side deployable (separate from the web app). It reads the
 * target user's Google Tasks via the Zapier SDK and upserts them into the
 * `todos` table so a task made on the phone shows up on the board.
 *
 * This file does one job: build the real clients and hand them to runSync().
 * Everything testable lives in src/ — see tests/ for the mocked-network runs.
 *
 * Security (see CLAUDE.md):
 * - Talks to Supabase with the SERVICE_ROLE key (server-only, never VITE_,
 *   never committed). service_role bypasses RLS, so we set user_id explicitly
 *   to the target user on every row.
 * - Multi-user = each person runs their OWN agent with their own
 *   SYNC_TARGET_USER_ID and their own Google Tasks connection.
 */
import { createClient } from '@supabase/supabase-js'
import { createZapierSdk } from '@zapier/zapier-sdk'
import { loadConfig } from './src/config.ts'
import { explainFailure } from './src/errors.ts'
import { stdoutLog as log } from './src/log.ts'
import { runSync } from './src/run.ts'
import type { ZapierLike } from './src/google-tasks.ts'

// Last-resort visibility: if the SDK floats a rejection or throws async, Node
// would otherwise crash silently. Log it synchronously first.
process.on('unhandledRejection', (reason) => {
  log(`unhandledRejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`)
  process.exitCode = 1
})
process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${err.stack ?? err.message}`)
  process.exitCode = 1
})

// Top-level await + exitCode (not process.exit) so stdout/stderr fully flush —
// process.exit() can truncate buffered logs and hide the real error on a crash.
try {
  const config = loadConfig()

  // Supabase client with the service_role key — server-only, bypasses RLS.
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Uses the local CLI token in dev, or ZAPIER_CREDENTIALS_CLIENT_ID/SECRET env
  // vars on a server (Railway). No secrets in code.
  const zapier = createZapierSdk() as unknown as ZapierLike

  await runSync({ zapier, supabase, config, log })
} catch (err) {
  log(`Agent failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
  // If it's a failure we recognise, say what to do about it — the stack trace
  // above is never the useful part.
  const help = explainFailure(err)
  if (help) log(`\n${help}`)
  process.exitCode = 1
}
