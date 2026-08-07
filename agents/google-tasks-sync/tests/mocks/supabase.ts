/**
 * A fake Supabase — also at the network layer.
 *
 * Same idea as the Zapier fake: the agent uses the real `@supabase/supabase-js`
 * client, which builds a real PostgREST request to
 * `POST /rest/v1/rpc/sync_external_todos`. MSW answers it, so the test asserts
 * on the exact payload the database *would* have received.
 */
import { http, HttpResponse, type RequestHandler } from 'msw'
import type { SyncRow } from '../../src/todos.ts'

export const FAKE_SUPABASE_URL = 'https://fake-project.supabase.co'
export const FAKE_SERVICE_ROLE_KEY = 'fake-service-role-key'
export const FAKE_USER_ID = '99999999-8888-7777-6666-555555555555'

export type RpcCall = {
  p_user_id: string
  p_tasks: SyncRow[]
}

export type FakeSupabase = {
  handlers: RequestHandler[]
  /** Every sync_external_todos call, in order — assert on these. */
  calls: RpcCall[]
}

export type FakeSupabaseOptions = {
  /** Make the RPC fail, to prove the agent surfaces DB errors instead of exiting 0. */
  failWith?: { status: number; message: string }
}

export function fakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const calls: RpcCall[] = []

  const handlers: RequestHandler[] = [
    http.post(`${FAKE_SUPABASE_URL}/rest/v1/rpc/sync_external_todos`, async ({ request }) => {
      const body = (await request.json()) as RpcCall
      calls.push(body)

      if (options.failWith) {
        return HttpResponse.json(
          { message: options.failWith.message, code: 'P0001' },
          { status: options.failWith.status },
        )
      }

      // The SQL function returns the number of rows inserted/updated.
      return HttpResponse.json(body.p_tasks.length)
    }),
  ]

  return { handlers, calls }
}
