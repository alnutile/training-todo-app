/**
 * Deno unit tests for the pure part of the Edge Function.
 *
 * Run locally: deno test supabase/functions/
 * CI runs the same command — see .github/workflows/ci.yml.
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { isLane, summarize } from './stats.ts'

Deno.test('summarize: an empty board is 0%, never NaN', () => {
  assertEquals(summarize([]), {
    total: 0,
    done: 0,
    pct: 0,
    byLane: { backlog: 0, next: 0, in_progress: 0, done: 0 },
  })
})

Deno.test('summarize: counts each lane', () => {
  const stats = summarize([
    { status: 'backlog' },
    { status: 'backlog' },
    { status: 'next' },
    { status: 'in_progress' },
    { status: 'done' },
  ])

  assertEquals(stats.byLane, { backlog: 2, next: 1, in_progress: 1, done: 1 })
  assertEquals(stats.total, 5)
  assertEquals(stats.done, 1)
})

Deno.test('summarize: rounds the percentage to a whole number', () => {
  assertEquals(summarize([{ status: 'done' }, { status: 'backlog' }, { status: 'backlog' }]).pct, 33)
  assertEquals(summarize([{ status: 'done' }, { status: 'backlog' }]).pct, 50)
  assertEquals(summarize([{ status: 'done' }]).pct, 100)
})

Deno.test('summarize: an unknown status still counts toward the total', () => {
  // If someone adds a lane to the enum before this function is redeployed, it
  // should keep answering rather than crash.
  const stats = summarize([{ status: 'blocked' }, { status: 'done' }])

  assertEquals(stats.total, 2)
  assertEquals(stats.done, 1)
  assertEquals(stats.byLane.done, 1)
})

Deno.test('summarize: tolerates a null or missing status', () => {
  const stats = summarize([{ status: null }, {}, { status: 'done' }])

  assertEquals(stats.total, 3)
  assertEquals(stats.pct, 33)
})

Deno.test('isLane: recognises exactly the four lanes', () => {
  assertEquals(isLane('backlog'), true)
  assertEquals(isLane('in_progress'), true)
  assertEquals(isLane('In Progress'), false)
  assertEquals(isLane(undefined), false)
  assertEquals(isLane(null), false)
})
