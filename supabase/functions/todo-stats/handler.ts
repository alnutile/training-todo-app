/**
 * The todo-stats HTTP handler, with its dependencies passed in.
 *
 * `index.ts` wires the real environment to this; the tests wire a fake `fetch`.
 * Same code path either way, so the test proves the real thing — including that
 * we forward the caller's JWT rather than using a service_role key.
 *
 * Security (see CLAUDE.md): this function calls PostgREST **as the caller**. It
 * never holds a service_role key, so Row Level Security still decides which
 * rows exist. A user asking for stats can only ever be told about their own
 * board — the function has no power to leak someone else's.
 */
import { summarize, type Stats, type TodoRow } from './stats.ts'

export type Deps = {
  fetch: typeof fetch
  supabaseUrl: string
  /** Publishable/anon key — public by design, and RLS-bound. */
  anonKey: string
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authorization = req.headers.get('Authorization')
  if (!authorization) {
    // No token, no answer. Without this an anonymous caller would reach
    // PostgREST with only the anon key and get an empty board back — a 200 that
    // looks like "you have no tasks" instead of "you are not signed in".
    return json({ error: 'Missing Authorization header' }, 401)
  }

  const url = `${deps.supabaseUrl}/rest/v1/todos?select=status`
  const response = await deps.fetch(url, {
    headers: {
      apikey: deps.anonKey,
      // The caller's own JWT — RLS applies to this request exactly as it does
      // in the browser.
      Authorization: authorization,
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return json({ error: 'Could not read todos', status: response.status, detail }, 502)
  }

  const rows = (await response.json()) as TodoRow[]
  const stats: Stats = summarize(Array.isArray(rows) ? rows : [])
  return json(stats)
}
