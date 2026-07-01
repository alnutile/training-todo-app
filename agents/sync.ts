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
import { createClient } from '@supabase/supabase-js'
import { createZapierSdk } from '@zapier/zapier-sdk'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

const SUPABASE_URL = requireEnv('SUPABASE_URL')
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const TARGET_USER_ID = requireEnv('SYNC_TARGET_USER_ID')
const CONNECTION_ID = requireEnv('GOOGLE_TASKS_CONNECTION_ID')

// Discovered via `zapier-sdk list-actions GoogleTasksCLIAPI` (not guessed).
const APP = 'GoogleTasksCLIAPI'
const LIST_TASK_LISTS = { actionType: 'read' as const, action: 'list_task_lists' }
const GET_TASKS_BY_LIST = { actionType: 'search' as const, action: 'get_tasks_by_list' }

type GoogleTask = { id: string; title?: string; status?: string }
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
  console.log(`Found ${lists.length} Google Tasks list(s).`)

  const tasks: GoogleTask[] = []
  for (const list of lists) {
    if (!list.id) continue
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
          tasks.push({ id: t.id, title: t.title, status: t.status })
        }
      }
    }
  }
  return tasks
}

async function main() {
  const googleTasks = await readAllGoogleTasks()

  // Keep tasks with a real title; dedupe by id (last wins) so a single upsert
  // payload never hits the same conflict row twice.
  const byId = new Map<string, SyncRow>()
  for (const t of googleTasks) {
    const title = (t.title ?? '').trim()
    if (!title) continue
    byId.set(t.id, { external_id: t.id, title, status: mapStatus(t.status) })
  }
  const rows = [...byId.values()]

  console.log(
    `Read ${googleTasks.length} task(s); upserting ${rows.length} with titles ` +
      `for user ${TARGET_USER_ID}.`,
  )
  if (rows.length === 0) {
    console.log('Nothing to sync.')
    return
  }

  const { data, error } = await supabase.rpc('sync_external_todos', {
    p_user_id: TARGET_USER_ID,
    p_tasks: rows,
  })
  if (error) {
    console.error('Upsert failed:', error.message)
    process.exit(1)
  }
  console.log(`✓ Sync complete. Rows inserted/updated: ${data}`)
}

main().catch((err) => {
  console.error('Agent failed:', err)
  process.exit(1)
})
