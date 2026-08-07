/**
 * The Zapier SDK side of the agent: read every task, across every task list.
 *
 * The SDK is passed in rather than constructed here, so a test can hand it a
 * real `createZapierSdk()` pointed at a faked network (see tests/mocks/zapier.ts).
 */
import type { Logger } from './log.ts'
import { rssMB } from './log.ts'
import type { GoogleTask } from './todos.ts'

// Discovered via `zapier-sdk list-actions GoogleTasksCLIAPI` (not guessed).
export const APP = 'GoogleTasksCLIAPI'
export const LIST_TASK_LISTS = { actionType: 'read' as const, action: 'list_task_lists' }
export const GET_TASKS_BY_LIST = { actionType: 'search' as const, action: 'get_tasks_by_list' }

/** The slice of the Zapier SDK this agent uses. */
export type ZapierLike = {
  runAction(options: {
    app: string
    actionType: 'read' | 'search'
    action: string
    connection: string
    inputs?: Record<string, unknown>
  }): { items(): AsyncIterable<unknown> }
}

export type TaskList = { id?: string; title?: string }

export type ReadOptions = {
  connectionId: string
  log: Logger
}

/**
 * Read every task across every task list (including completed ones).
 *
 * One failing list never aborts the run — it's logged and skipped. If *every*
 * list fails, that's almost always a credentials-scope problem, so we say so
 * instead of quietly reporting "nothing to sync".
 */
export async function readAllGoogleTasks(
  zapier: ZapierLike,
  { connectionId, log }: ReadOptions,
): Promise<GoogleTask[]> {
  const lists: TaskList[] = []
  for await (const item of zapier
    .runAction({ app: APP, ...LIST_TASK_LISTS, connection: connectionId })
    .items()) {
    lists.push(item as TaskList)
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
          connection: connectionId,
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
      failed++
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
      log(`  ! Skipped list "${label}": ${message}`)
    }
  }

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
