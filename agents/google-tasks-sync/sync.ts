/**
 * Google Tasks -> todos sync agent.
 *
 * A per-user, server-side deployable (separate from the web app). It reads the
 * target user's Google Tasks via the Zapier SDK and upserts them into the
 * `todos` table so a task made on the phone shows up on the board.
 *
 * Security (see CLAUDE.md):
 * - Talks to Supabase with the SERVICE_ROLE key (server-only, never VITE_,
 *   never committed). service_role bypasses RLS, so we set user_id explicitly
 *   to the target user on every row.
 * - Multi-user = each person runs their OWN agent with their own
 *   SYNC_TARGET_USER_ID and their own Google Tasks connection.
 */
import { writeSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createZapierSdk } from '@zapier/zapier-sdk'

// Synchronous stdout write — unlike console.log (async to a pipe), this survives
// an immediate hard kill (e.g. OOM SIGKILL), so progress logs aren't lost.
function log(msg: string): void {
  writeSync(1, msg + '\n')
}

const rssMB = () => `${Math.round(process.memoryUsage().rss / 1048576)}MB`

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

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const TARGET_USER_ID = requireEnv('SYNC_TARGET_USER_ID')
const CONNECTION_ID = requireEnv('GOOGLE_TASKS_CONNECTION_ID')

// Cap how many of the most-recently-updated tasks to sync (keeps the demo board
// tidy). Default 50; set SYNC_LIMIT=0 to sync everything.
const SYNC_LIMIT = (() => {
  const raw = process.env.SYNC_LIMIT
  if (raw === undefined || raw === '') return 50
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 50
})()

// Discovered via `zapier-sdk list-actions GoogleTasksCLIAPI` (not guessed).
const APP = 'GoogleTasksCLIAPI'
const LIST_TASK_LISTS = { actionType: 'read' as const, action: 'list_task_lists' }
const GET_TASKS_BY_LIST = { actionType: 'search' as const, action: 'get_tasks_by_list' }

type GoogleTask = { id: string; title?: string; status?: string; updated?: string }
type SyncRow = { external_id: string; title: string; status: 'backlog' | 'done' }

// Supabase client with the service_role key — server-only, bypasses RLS.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Uses the local CLI token in dev, or ZAPIER_CREDENTIALS_CLIENT_ID/SECRET env
// vars on a server (Railway). No secrets in code.
const zapier = createZapierSdk()

/** Google Tasks status -> our lane. incomplete (needsAction) -> backlog. */
function mapStatus(googleStatus?: string): 'backlog' | 'done' {
  return googleStatus === 'completed' ? 'done' : 'backlog'
}

/** Read every task across every task list (including completed). */
async function readAllGoogleTasks(): Promise<GoogleTask[]> {
  const lists: Array<{ id?: string; title?: string }> = []
  for await (const item of zapier
    .runAction({ app: APP, ...LIST_TASK_LISTS, connection: CONNECTION_ID })
    .items()) {
    lists.push(item as { id?: string; title?: string })
  }
  log(`Found ${lists.length} Google Tasks list(s). (rss ${rssMB()})`)

  const tasks: GoogleTask[] = []
  const withId = lists.filter((l) => l.id)
  let failed = 0
  for (const [i, list] of lists.entries()) {
    if (!list.id) continue
    const label = list.title ?? list.id
    log(`  [${i + 1}/${lists.length}] reading "${label}"… (rss ${rssMB()}, ${tasks.length} so far)`)
    try {
      for await (const item of zapier
        .runAction({
          app: APP,
          ...GET_TASKS_BY_LIST,
          connection: CONNECTION_ID,
          inputs: { task_list: list.id, show_completed: true },
        })
        .items()) {
        // get_tasks_by_list returns line-item results: { tasks: [...] }.
        const record = item as { tasks?: GoogleTask[] } & GoogleTask
        const inner = Array.isArray(record.tasks) ? record.tasks : [record]
        for (const t of inner) {
          if (t && typeof t.id === 'string') {
            tasks.push({ id: t.id, title: t.title, status: t.status, updated: t.updated })
          }
        }
      }
    } catch (err) {
      // One bad list shouldn't abort the whole sync — log which one and move on.
      failed++
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
      log(`  ! Skipped list "${label}": ${message}`)
    }
  }

  // Every list denied usually means the Zapier credentials lack the scope to
  // execute actions — spell out the fix rather than silently syncing nothing.
  if (withId.length > 0 && failed === withId.length) {
    log(
      `All ${failed} list(s) were denied. The Zapier client credentials likely ` +
        `lack the "external" scope. Recreate them with:\n` +
        `  npx -p @zapier/zapier-sdk-cli zapier-sdk create-client-credentials ` +
        `"todo-sync-agent" --allowed-scopes external --json\n` +
        `then update ZAPIER_CREDENTIALS_CLIENT_ID/SECRET.`,
    )
  }
  return tasks
}

async function main() {
  const googleTasks = await readAllGoogleTasks()

  // Keep tasks with a real title; dedupe by id (keep the most recently updated
  // copy) so a single upsert payload never hits the same conflict row twice.
  const byId = new Map<string, GoogleTask>()
  for (const t of googleTasks) {
    if (!(t.title ?? '').trim()) continue
    const existing = byId.get(t.id)
    if (!existing || (t.updated ?? '') > (existing.updated ?? '')) byId.set(t.id, t)
  }

  // Newest first, then cap to SYNC_LIMIT (0 = no cap). `updated` is ISO 8601,
  // so string compare orders it correctly.
  let picked = [...byId.values()].sort((a, b) =>
    (b.updated ?? '').localeCompare(a.updated ?? ''),
  )
  const total = picked.length
  if (SYNC_LIMIT > 0) picked = picked.slice(0, SYNC_LIMIT)

  const rows: SyncRow[] = picked.map((t) => ({
    external_id: t.id,
    title: t.title!.trim(),
    status: mapStatus(t.status),
  }))

  log(
    `Read ${googleTasks.length} task(s); ${total} with titles; upserting the ` +
      `latest ${rows.length}${SYNC_LIMIT > 0 ? ` (SYNC_LIMIT=${SYNC_LIMIT})` : ' (no cap)'} ` +
      `for user ${TARGET_USER_ID}.`,
  )
  if (rows.length === 0) {
    log('Nothing to sync.')
    return
  }

  const { data, error } = await supabase.rpc('sync_external_todos', {
    p_user_id: TARGET_USER_ID,
    p_tasks: rows,
  })
  if (error) throw new Error(`Upsert failed: ${error.message}`)
  log(`✓ Sync complete. Rows inserted/updated: ${data}`)
}

// Top-level await + exitCode (not process.exit) so stdout/stderr fully flush —
// process.exit() can truncate buffered logs and hide the real error on a crash.
try {
  await main()
} catch (err) {
  log(`Agent failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
  process.exitCode = 1
}
