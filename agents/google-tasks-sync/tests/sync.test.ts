/**
 * Integration test: the whole agent, over a faked network.
 *
 * Real Zapier SDK. Real Supabase client. Real HTTP requests, built by real
 * libraries. The only thing that isn't real is the far end of the wire — MSW
 * answers instead of zapier.com and supabase.co.
 *
 * If any request escapes the fakes, `onUnhandledRequest: 'error'` (see
 * mocks/server.ts) fails the test. Nothing here can cost money or touch a real
 * Google account.
 */
import { createClient } from '@supabase/supabase-js'
import { createZapierSdk } from '@zapier/zapier-sdk'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from './mocks/server.ts'
import { FAKE_CONNECTION_ID, fakeZapier, type FakeZapierData } from './mocks/zapier.ts'
import {
  FAKE_SERVICE_ROLE_KEY,
  FAKE_SUPABASE_URL,
  FAKE_USER_ID,
  fakeSupabase,
} from './mocks/supabase.ts'
import { createMemoryLog } from '../src/log.ts'
import type { SyncConfig } from '../src/config.ts'
import type { ZapierLike } from '../src/google-tasks.ts'
import { runSync } from '../src/run.ts'

const config: SyncConfig = {
  supabaseUrl: FAKE_SUPABASE_URL,
  serviceRoleKey: FAKE_SERVICE_ROLE_KEY,
  targetUserId: FAKE_USER_ID,
  connectionId: FAKE_CONNECTION_ID,
  syncLimit: 50,
}

/** Two lists, three tasks, one of them already completed. */
const twoLists: FakeZapierData = {
  lists: [
    { id: 'list-personal', title: 'My Tasks' },
    { id: 'list-work', title: 'Work' },
  ],
  tasksByList: {
    'list-personal': [
      { id: 'g1', title: 'Buy milk', status: 'needsAction', updated: '2026-03-01T00:00:00.000Z' },
      { id: 'g2', title: 'Renew passport', status: 'completed', updated: '2026-02-01T00:00:00.000Z' },
    ],
    'list-work': [
      { id: 'g3', title: 'Ship the video', status: 'needsAction', updated: '2026-04-01T00:00:00.000Z' },
    ],
  },
}

function realClients() {
  return {
    zapier: createZapierSdk() as unknown as ZapierLike,
    supabase: createClient(FAKE_SUPABASE_URL, FAKE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
}

describe('runSync over a faked network', () => {
  let log: ReturnType<typeof createMemoryLog>

  beforeEach(() => {
    log = createMemoryLog()
  })

  it('reads every list and upserts the tasks it found', async () => {
    const zap = fakeZapier(twoLists)
    const db = fakeSupabase()
    server.use(...zap.handlers, ...db.handlers)

    const result = await runSync({ ...realClients(), config, log })

    expect(result).toEqual({ read: 3, withTitles: 3, sent: 3, upserted: 3 })

    // It asked Zapier for the lists, then for each list's tasks.
    expect(zap.runs.map((r) => r.actionKey)).toEqual([
      'list_task_lists',
      'get_tasks_by_list',
      'get_tasks_by_list',
    ])
    // …and asked for completed tasks too, or the Done lane would always be empty.
    expect(zap.runs[1].inputs).toEqual({ task_list: 'list-personal', show_completed: true })

    // Exactly one write, carrying the rows the database would have stored.
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].p_user_id).toBe(FAKE_USER_ID)
    expect(db.calls[0].p_tasks).toEqual([
      { external_id: 'g3', title: 'Ship the video', status: 'backlog' },
      { external_id: 'g1', title: 'Buy milk', status: 'backlog' },
      { external_id: 'g2', title: 'Renew passport', status: 'done' },
    ])
  })

  it('writes rows for the target user and nobody else', async () => {
    server.use(...fakeZapier(twoLists).handlers)
    const db = fakeSupabase()
    server.use(...db.handlers)

    await runSync({ ...realClients(), config, log })

    // service_role bypasses RLS, so the agent is the only thing standing
    // between one person's board and another's. Pin that down.
    expect(db.calls[0].p_user_id).toBe(FAKE_USER_ID)
  })

  it('honours SYNC_LIMIT, newest first', async () => {
    server.use(...fakeZapier(twoLists).handlers)
    const db = fakeSupabase()
    server.use(...db.handlers)

    const result = await runSync({ ...realClients(), config: { ...config, syncLimit: 1 }, log })

    expect(result.sent).toBe(1)
    expect(db.calls[0].p_tasks).toEqual([
      { external_id: 'g3', title: 'Ship the video', status: 'backlog' },
    ])
  })

  it('skips a list Zapier refuses and still syncs the rest', async () => {
    const zap = fakeZapier({ ...twoLists, deniedListIds: ['list-work'] })
    const db = fakeSupabase()
    server.use(...zap.handlers, ...db.handlers)

    const result = await runSync({ ...realClients(), config, log })

    expect(result.read).toBe(2)
    expect(db.calls[0].p_tasks.map((t) => t.external_id).sort()).toEqual(['g1', 'g2'])
    expect(log.lines.join('\n')).toContain('Skipped list "Work"')
  })

  it('calls out a credentials-scope problem when every list is refused', async () => {
    const zap = fakeZapier({ ...twoLists, deniedListIds: ['list-personal', 'list-work'] })
    server.use(...zap.handlers, ...fakeSupabase().handlers)

    const result = await runSync({ ...realClients(), config, log })

    expect(result).toEqual({ read: 0, withTitles: 0, sent: 0, upserted: 0 })
    expect(log.lines.join('\n')).toContain('lack the "external" scope')
  })

  it('writes nothing when there is nothing to sync', async () => {
    const zap = fakeZapier({ lists: [], tasksByList: {} })
    const db = fakeSupabase()
    server.use(...zap.handlers, ...db.handlers)

    const result = await runSync({ ...realClients(), config, log })

    expect(result.sent).toBe(0)
    expect(db.calls).toHaveLength(0)
    expect(log.lines).toContain('Nothing to sync.')
  })

  it('fails loudly when the database rejects the write', async () => {
    server.use(...fakeZapier(twoLists).handlers)
    server.use(...fakeSupabase({ failWith: { status: 400, message: 'duplicate key' } }).handlers)

    // A cron job that swallows this would look green forever while syncing nothing.
    await expect(runSync({ ...realClients(), config, log })).rejects.toThrow(/Upsert failed/)
  })
})
