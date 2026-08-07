/**
 * A fake Supabase for the browser tests.
 *
 * The component keeps using the real `supabase-js` client. What changes is who
 * answers: MSW plays the PostgREST + Auth endpoints, backed by a plain array of
 * rows. So a test can say "this user has three cards" and assert the board
 * renders them, with no project, no keys, and no network.
 */
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { Status, Todo } from '../../types'

// Must match the values vitest.config.ts injects as VITE_SUPABASE_* .
export const TEST_SUPABASE_URL = 'https://fake-project.supabase.co'
export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001'

let idCounter = 0

/** Build a row without spelling out all eight columns every time. */
export function makeTodo(over: Partial<Todo> & { title: string }): Todo {
  idCounter += 1
  return {
    id: `todo-${idCounter}`,
    user_id: TEST_USER_ID,
    notes: null,
    status: 'backlog' as Status,
    position: idCounter,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

export type FakeDb = {
  handlers: RequestHandler[]
  /** Current rows — read it after an action to see what the app persisted. */
  rows: Todo[]
  /** Every write the app made, in order. */
  writes: Array<{ method: string; body: unknown }>
}

/** PostgREST-shaped handlers over an in-memory list of todos. */
export function fakeTodosApi(initial: Todo[] = []): FakeDb {
  const rows = [...initial]
  const writes: FakeDb['writes'] = []
  const base = `${TEST_SUPABASE_URL}/rest/v1/todos`

  const handlers: RequestHandler[] = [
    http.get(base, () => HttpResponse.json(rows)),

    http.post(base, async ({ request }) => {
      const body = (await request.json()) as Partial<Todo> | Partial<Todo>[]
      writes.push({ method: 'POST', body })
      for (const row of Array.isArray(body) ? body : [body]) {
        rows.push(makeTodo({ title: '', ...row } as Partial<Todo> & { title: string }))
      }
      return HttpResponse.json(rows.slice(-1), { status: 201 })
    }),

    http.patch(base, async ({ request }) => {
      const body = (await request.json()) as Partial<Todo>
      writes.push({ method: 'PATCH', body })
      // `?id=eq.<uuid>` — the filter supabase-js builds from .eq('id', id).
      const id = idFromUrl(request.url)
      const row = rows.find((r) => r.id === id)
      if (row) Object.assign(row, body)
      return HttpResponse.json(row ? [row] : [])
    }),

    http.delete(base, ({ request }) => {
      const id = idFromUrl(request.url)
      writes.push({ method: 'DELETE', body: { id } })
      const index = rows.findIndex((r) => r.id === id)
      if (index >= 0) rows.splice(index, 1)
      return HttpResponse.json([])
    }),
  ]

  return { handlers, rows, writes }
}

function idFromUrl(url: string): string | undefined {
  const raw = new URL(url).searchParams.get('id')
  return raw?.startsWith('eq.') ? raw.slice(3) : (raw ?? undefined)
}

export type FakeAuthOptions = {
  /** Reject the sign-in, to check the error actually reaches the screen. */
  signInError?: string
}

/** The handful of Auth endpoints the login screen touches. */
export function fakeAuthApi(options: FakeAuthOptions = {}): {
  handlers: RequestHandler[]
  magicLinkRequests: Array<{ email: string }>
} {
  const magicLinkRequests: Array<{ email: string }> = []
  const base = `${TEST_SUPABASE_URL}/auth/v1`

  const handlers: RequestHandler[] = [
    http.post(`${base}/token`, async ({ request }) => {
      const body = (await request.json()) as { email?: string }
      if (options.signInError) {
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: options.signInError, message: options.signInError },
          { status: 400 },
        )
      }
      return HttpResponse.json(session(body.email ?? 'user@example.com'))
    }),

    http.post(`${base}/signup`, async ({ request }) => {
      const body = (await request.json()) as { email?: string }
      return HttpResponse.json(session(body.email ?? 'user@example.com'))
    }),

    http.post(`${base}/otp`, async ({ request }) => {
      const body = (await request.json()) as { email?: string }
      magicLinkRequests.push({ email: body.email ?? '' })
      return HttpResponse.json({})
    }),

    http.post(`${base}/logout`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${base}/user`, () => HttpResponse.json(user('user@example.com'))),
  ]

  return { handlers, magicLinkRequests }
}

function user(email: string) {
  return {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function session(email: string) {
  return {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-token',
    user: user(email),
  }
}
