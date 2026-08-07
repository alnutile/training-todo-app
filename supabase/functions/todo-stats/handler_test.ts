/**
 * Deno tests for the Edge Function's HTTP behaviour.
 *
 * Same mocking idea as the rest of the repo, one level simpler: instead of
 * intercepting the network we hand the handler its own `fetch`. Nothing here
 * reaches a real Supabase project, so `deno test` needs no network permission
 * at all.
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest, type Deps } from './handler.ts'

const SUPABASE_URL = 'https://fake-project.supabase.co'
const ANON_KEY = 'sb_publishable_test_key'
const JWT = 'Bearer fake.jwt.token'

type Recorded = { url: string; headers: Record<string, string> }

/** A fetch that answers with `rows` and records how it was called. */
function fakeFetch(rows: unknown, init: { status?: number; body?: string } = {}) {
  const calls: Recorded[] = []

  const fn = ((input: string | URL | Request, options?: RequestInit) => {
    const headers = new Headers(options?.headers)
    calls.push({
      url: String(input),
      headers: Object.fromEntries(headers.entries()),
    })
    const status = init.status ?? 200
    const body = init.body ?? JSON.stringify(rows)
    return Promise.resolve(new Response(body, { status }))
  }) as unknown as typeof fetch

  return { fn, calls }
}

function deps(fetchFn: typeof fetch): Deps {
  return { fetch: fetchFn, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY }
}

Deno.test('answers a signed-in caller with their board summary', async () => {
  const { fn, calls } = fakeFetch([{ status: 'done' }, { status: 'backlog' }])

  const response = await handleRequest(
    new Request('https://edge.test/todo-stats', { headers: { Authorization: JWT } }),
    deps(fn),
  )

  assertEquals(response.status, 200)
  assertEquals(await response.json(), {
    total: 2,
    done: 1,
    pct: 50,
    byLane: { backlog: 1, next: 0, in_progress: 0, done: 1 },
  })

  assertEquals(calls.length, 1)
  assertEquals(calls[0].url, `${SUPABASE_URL}/rest/v1/todos?select=status`)
})

Deno.test('forwards the caller JWT so RLS still applies', async () => {
  const { fn, calls } = fakeFetch([])

  await handleRequest(
    new Request('https://edge.test/todo-stats', { headers: { Authorization: JWT } }),
    deps(fn),
  )

  // The whole security model of this function is in these two lines: it asks
  // the database *as the user*, with the public anon key. Swap in a
  // service_role key here and it would happily read anyone's board.
  assertEquals(calls[0].headers['authorization'], JWT)
  assertEquals(calls[0].headers['apikey'], ANON_KEY)
})

Deno.test('rejects a caller with no token, and does not touch the database', async () => {
  const { fn, calls } = fakeFetch([])

  const response = await handleRequest(new Request('https://edge.test/todo-stats'), deps(fn))

  assertEquals(response.status, 401)
  assertEquals(calls.length, 0)
})

Deno.test('rejects methods it does not serve', async () => {
  const { fn } = fakeFetch([])

  const response = await handleRequest(
    new Request('https://edge.test/todo-stats', { method: 'DELETE', headers: { Authorization: JWT } }),
    deps(fn),
  )

  assertEquals(response.status, 405)
})

Deno.test('answers a CORS preflight', async () => {
  const { fn } = fakeFetch([])

  const response = await handleRequest(
    new Request('https://edge.test/todo-stats', { method: 'OPTIONS' }),
    deps(fn),
  )

  assertEquals(response.status, 204)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*')
})

Deno.test('turns a database failure into a 502, not a wrong answer', async () => {
  const { fn } = fakeFetch(null, { status: 403, body: 'permission denied for table todos' })

  const response = await handleRequest(
    new Request('https://edge.test/todo-stats', { headers: { Authorization: JWT } }),
    deps(fn),
  )

  assertEquals(response.status, 502)
  const body = (await response.json()) as { error: string; status: number }
  assertEquals(body.status, 403)
})

Deno.test('does not fall over if the database returns something unexpected', async () => {
  const { fn } = fakeFetch(null, { body: JSON.stringify({ message: 'nope' }) })

  const response = await handleRequest(
    new Request('https://edge.test/todo-stats', { headers: { Authorization: JWT } }),
    deps(fn),
  )

  assertEquals(response.status, 200)
  assertEquals((await response.json()).total, 0)
})
