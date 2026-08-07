/**
 * Tests for "whose board is this?".
 *
 * Getting this wrong is the worst bug this agent could have: service_role
 * bypasses RLS, so a mistake here writes one person's tasks onto another
 * person's board. Worth being fussy about.
 */
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { server } from './mocks/server.ts'
import { FAKE_SERVICE_ROLE_KEY, FAKE_SUPABASE_URL, fakeSupabase } from './mocks/supabase.ts'
import { resolveTarget } from '../src/config.ts'
import { createMemoryLog } from '../src/log.ts'
import { resolveTargetUserId } from '../src/target-user.ts'

const ALICE = { id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'alice@example.com' }
const BOB = { id: 'bbbbbbbb-0000-4000-8000-000000000002', email: 'bob@example.com' }

function adminAuth() {
  return createClient(FAKE_SUPABASE_URL, FAKE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth
}

describe('resolveTarget (reading the env)', () => {
  it('prefers an explicit user id', () => {
    expect(resolveTarget({ SYNC_TARGET_USER_ID: ALICE.id })).toEqual({
      kind: 'id',
      userId: ALICE.id,
    })
  })

  it('falls back to an email', () => {
    expect(resolveTarget({ SYNC_TARGET_EMAIL: ALICE.email })).toEqual({
      kind: 'email',
      email: ALICE.email,
    })
  })

  it('takes the id when both are set — an id is never ambiguous', () => {
    const target = resolveTarget({
      SYNC_TARGET_USER_ID: ALICE.id,
      SYNC_TARGET_EMAIL: BOB.email,
    })

    expect(target).toEqual({ kind: 'id', userId: ALICE.id })
  })

  it('ignores blank values rather than syncing to an empty string', () => {
    expect(resolveTarget({ SYNC_TARGET_USER_ID: '   ', SYNC_TARGET_EMAIL: ALICE.email })).toEqual({
      kind: 'email',
      email: ALICE.email,
    })
  })

  it('refuses to guess when neither is set', () => {
    expect(() => resolveTarget({})).toThrow(/SYNC_TARGET_USER_ID or SYNC_TARGET_EMAIL/)
  })
})

describe('resolveTargetUserId (asking Supabase)', () => {
  it('passes an id straight through without a lookup', async () => {
    // No handlers registered: if this made a request, the strict mock server
    // would fail the test. That's the assertion.
    const log = createMemoryLog()

    const id = await resolveTargetUserId(adminAuth(), { kind: 'id', userId: ALICE.id }, log)

    expect(id).toBe(ALICE.id)
  })

  it('finds the account that owns an email', async () => {
    server.use(...fakeSupabase({ users: [ALICE, BOB] }).handlers)
    const log = createMemoryLog()

    const id = await resolveTargetUserId(adminAuth(), { kind: 'email', email: BOB.email }, log)

    expect(id).toBe(BOB.id)
    expect(log.lines.join('\n')).toContain(BOB.id)
  })

  it('matches regardless of case', async () => {
    server.use(...fakeSupabase({ users: [ALICE] }).handlers)

    const id = await resolveTargetUserId(
      adminAuth(),
      { kind: 'email', email: 'ALICE@Example.COM' },
      createMemoryLog(),
    )

    expect(id).toBe(ALICE.id)
  })

  it('says what to do when the account does not exist yet', async () => {
    server.use(...fakeSupabase({ users: [ALICE] }).handlers)

    await expect(
      resolveTargetUserId(adminAuth(), { kind: 'email', email: 'nobody@example.com' }, createMemoryLog()),
    ).rejects.toThrow(/No account found for nobody@example.com.*Sign in to the app/s)
  })

  it('never falls back to some other account when the email misses', async () => {
    server.use(...fakeSupabase({ users: [ALICE, BOB] }).handlers)

    // The dangerous failure mode: quietly picking the first user and writing
    // somebody else's tasks onto their board.
    await expect(
      resolveTargetUserId(adminAuth(), { kind: 'email', email: 'typo@example.com' }, createMemoryLog()),
    ).rejects.toThrow()
  })
})
