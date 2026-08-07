/**
 * A fake Zapier — at the network layer.
 *
 * The agent still calls the *real* `@zapier/zapier-sdk`. The SDK still builds
 * real HTTP requests. Those requests just never leave the machine: MSW answers
 * them here. So the test exercises our actual code path (auth, action lookup,
 * run, poll, pagination) without a Zapier account, without the network, and
 * without spending a task on somebody's real Google account.
 *
 * The five calls below are the SDK's real contract, discovered by watching what
 * it asks for — not guessed:
 *
 *   1. POST https://zapier.com/oauth/token/                    → client-credentials token
 *   2. POST https://zapier.com/api/v4/tracking/event/          → SDK telemetry (fire and forget)
 *   3. GET  .../api/v4/implementations/?selected_apis=App@latest → the app's action catalog
 *   4. POST .../api/actions/v1/runs                            → start an action run
 *   5. GET  .../api/actions/v1/runs/:runId                     → poll it for results
 */
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { GoogleTask } from '../../src/todos.ts'

export const ZAPIER_AUTH_HOST = 'https://zapier.com'
export const ZAPIER_SDK_API = 'https://sdkapi.zapier.com/api/v0/sdk/zapier'

export const FAKE_CONNECTION_ID = '11111111-2222-3333-4444-555555555555'

export type FakeZapierData = {
  /** The task lists `list_task_lists` returns. */
  lists: Array<{ id: string; title: string }>
  /** Tasks per list id, returned by `get_tasks_by_list`. */
  tasksByList: Record<string, GoogleTask[]>
  /** List ids Zapier should refuse (403), to exercise the skip-and-continue path. */
  deniedListIds?: string[]
}

export type FakeZapier = {
  handlers: RequestHandler[]
  /** Every action run the SDK asked for, in order — assert on these. */
  runs: Array<{ actionKey: string; inputs: Record<string, unknown> }>
}

type RunRequestBody = {
  data: {
    action_key: string
    action_type: string
    selected_api: string
    inputs?: Record<string, unknown>
    authentication_id?: string
  }
}

/** The action catalog the SDK looks up before it can run anything. */
const ACTIONS = [
  {
    id: 'list_task_lists',
    key: 'list_task_lists',
    // The API calls this field `type`; the SDK maps it to `action_type`.
    type: 'read',
    name: 'List Task Lists',
    noun: 'Task List',
  },
  {
    id: 'get_tasks_by_list',
    key: 'get_tasks_by_list',
    type: 'search',
    name: 'Get Tasks By List',
    noun: 'Task',
  },
]

export function fakeZapier(data: FakeZapierData): FakeZapier {
  const runs: FakeZapier['runs'] = []
  // runId -> the results that poll should hand back.
  const pending = new Map<string, unknown[]>()
  let nextRunId = 1

  const handlers: RequestHandler[] = [
    // 1. Auth. The agent's client credentials are fake, and that's the point.
    http.post(`${ZAPIER_AUTH_HOST}/oauth/token/`, () =>
      HttpResponse.json({
        access_token: 'fake-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    ),

    // 2. SDK telemetry. Swallowed so it can't reach out either.
    http.post(`${ZAPIER_AUTH_HOST}/api/v4/tracking/event/`, () => new HttpResponse(null, { status: 204 })),

    // 3. The action catalog for the requested app.
    http.get(`${ZAPIER_SDK_API}/api/v4/implementations/`, ({ request }) => {
      const selectedApi = new URL(request.url).searchParams.get('selected_apis') ?? ''
      return HttpResponse.json({
        results: [{ selected_api: selectedApi, actions: ACTIONS }],
      })
    }),

    // 4. Start a run. We decide right here what that run will return.
    http.post(`${ZAPIER_SDK_API}/api/actions/v1/runs`, async ({ request }) => {
      const body = (await request.json()) as RunRequestBody
      const actionKey = body.data.action_key
      const inputs = body.data.inputs ?? {}
      runs.push({ actionKey, inputs })

      if (actionKey === 'get_tasks_by_list') {
        const listId = String(inputs.task_list ?? '')
        if (data.deniedListIds?.includes(listId)) {
          // What a real scope/permission failure looks like to the SDK.
          return HttpResponse.json(
            { errors: [{ detail: `Permission denied for task list ${listId}` }] },
            { status: 403 },
          )
        }
      }

      const runId = `run_${nextRunId++}`
      pending.set(runId, resultsFor(data, actionKey, inputs))
      return HttpResponse.json({ data: { id: runId, status: 'success' } })
    }),

    // 5. Poll the run. 200 = done (202 would mean "still working").
    http.get(`${ZAPIER_SDK_API}/api/actions/v1/runs/:runId`, ({ params }) => {
      const runId = String(params.runId)
      return HttpResponse.json({
        data: { id: runId, status: 'success', results: pending.get(runId) ?? [] },
      })
    }),
  ]

  return { handlers, runs }
}

function resultsFor(
  data: FakeZapierData,
  actionKey: string,
  inputs: Record<string, unknown>,
): unknown[] {
  if (actionKey === 'list_task_lists') return data.lists

  if (actionKey === 'get_tasks_by_list') {
    const listId = String(inputs.task_list ?? '')
    const tasks = data.tasksByList[listId] ?? []
    // Google Tasks comes back as a single line-item record: { tasks: [...] }.
    return [{ tasks }]
  }

  return []
}
