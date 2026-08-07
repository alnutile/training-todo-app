/**
 * Supabase, faked inside the browser.
 *
 * Playwright can intercept the page's own network, so the app running in Chrome
 * makes its real requests and this answers them. Same trick as MSW in the unit
 * tests, one layer further out: nothing is stubbed in our code, and no test user
 * or project needs to exist.
 */
import type { Page, Route } from '@playwright/test'

export const SUPABASE_HOST = 'https://fake-project.supabase.co'
export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001'
export const TEST_EMAIL = 'you@example.com'

export type SeedTodo = {
  id?: string
  title: string
  status?: 'backlog' | 'next' | 'in_progress' | 'done'
  position?: number
}

type Row = Required<SeedTodo> & {
  user_id: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type FakeSupabase = {
  /** Current rows, as the fake database sees them. */
  rows: () => Row[]
  /** Every write the browser sent. */
  writes: () => Array<{ method: string; body: unknown }>
}

function toRow(seed: SeedTodo, index: number): Row {
  return {
    id: seed.id ?? `seed-${index + 1}`,
    user_id: TEST_USER_ID,
    title: seed.title,
    notes: null,
    status: seed.status ?? 'backlog',
    position: seed.position ?? index + 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function sessionBody() {
  return {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-token',
    user: {
      id: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: TEST_EMAIL,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Install the fake. Call before `page.goto`. */
export async function mockSupabase(page: Page, seed: SeedTodo[] = []): Promise<FakeSupabase> {
  const rows = seed.map(toRow)
  const writes: Array<{ method: string; body: unknown }> = []
  let nextId = rows.length + 1

  // Realtime dials a websocket the moment the board mounts. Swallow it rather
  // than letting Chrome try to resolve a host that does not exist.
  await page.routeWebSocket(/realtime/, () => {})

  await page.route(`${SUPABASE_HOST}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith('/token') || url.pathname.endsWith('/signup')) {
      return json(route, sessionBody())
    }
    if (url.pathname.endsWith('/otp')) return json(route, {})
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' })
    if (url.pathname.endsWith('/user')) return json(route, sessionBody().user)

    return json(route, {})
  })

  await page.route(`${SUPABASE_HOST}/rest/v1/todos**`, async (route) => {
    const request = route.request()
    const method = request.method()

    if (method === 'GET') return json(route, rows)

    const body = request.postDataJSON?.()
    writes.push({ method, body })

    if (method === 'POST') {
      const incoming = Array.isArray(body) ? body : [body]
      for (const item of incoming) {
        rows.push(toRow({ ...item }, nextId++))
      }
      return json(route, rows.slice(-1), 201)
    }

    const id = new URL(request.url()).searchParams.get('id')?.replace(/^eq\./, '')

    if (method === 'PATCH') {
      const row = rows.find((r) => r.id === id)
      if (row) Object.assign(row, body)
      return json(route, row ? [row] : [])
    }

    if (method === 'DELETE') {
      const index = rows.findIndex((r) => r.id === id)
      if (index >= 0) rows.splice(index, 1)
      return json(route, [])
    }

    return json(route, [])
  })

  return { rows: () => rows, writes: () => writes }
}
