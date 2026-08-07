/**
 * Unit tests: pure logic, no network, no mocking at all.
 *
 * These are the cheap ones. Same input -> same output, every time. When you add
 * a rule ("skip tasks with no title", "newest first", "cap at 50"), it gets a
 * line here and it stays true forever.
 */
import { describe, expect, it } from 'vitest'
import { mapStatus, toSyncRows, type GoogleTask } from '../src/todos.ts'
import { parseSyncLimit, requireEnv } from '../src/config.ts'

describe('mapStatus', () => {
  it('maps completed to the done lane', () => {
    expect(mapStatus('completed')).toBe('done')
  })

  it('maps everything else to backlog', () => {
    expect(mapStatus('needsAction')).toBe('backlog')
    expect(mapStatus(undefined)).toBe('backlog')
    expect(mapStatus('')).toBe('backlog')
    expect(mapStatus('something-new-google-invented')).toBe('backlog')
  })
})

describe('toSyncRows', () => {
  const task = (over: Partial<GoogleTask> & { id: string }): GoogleTask => ({
    title: `Task ${over.id}`,
    status: 'needsAction',
    updated: '2026-01-01T00:00:00.000Z',
    ...over,
  })

  it('turns Google tasks into todo rows', () => {
    const { rows } = toSyncRows([task({ id: 'a', title: 'Buy milk', status: 'completed' })], 50)

    expect(rows).toEqual([{ external_id: 'a', title: 'Buy milk', status: 'done' }])
  })

  it('drops tasks with no usable title', () => {
    const { rows, withTitles } = toSyncRows(
      [task({ id: 'a', title: '' }), task({ id: 'b', title: '   ' }), task({ id: 'c', title: 'Real' })],
      50,
    )

    expect(withTitles).toBe(1)
    expect(rows.map((r) => r.external_id)).toEqual(['c'])
  })

  it('trims whitespace off titles', () => {
    const { rows } = toSyncRows([task({ id: 'a', title: '  Padded  ' })], 50)

    expect(rows[0].title).toBe('Padded')
  })

  it('dedupes by id and keeps the most recently updated copy', () => {
    const { rows } = toSyncRows(
      [
        task({ id: 'a', title: 'Old title', updated: '2026-01-01T00:00:00.000Z' }),
        task({ id: 'a', title: 'New title', updated: '2026-06-01T00:00:00.000Z' }),
      ],
      50,
    )

    // A duplicate id in one upsert payload makes Postgres reject the whole
    // statement, so this one really matters.
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('New title')
  })

  it('sorts newest first and caps to the limit', () => {
    const { rows, withTitles } = toSyncRows(
      [
        task({ id: 'old', updated: '2026-01-01T00:00:00.000Z' }),
        task({ id: 'newest', updated: '2026-12-01T00:00:00.000Z' }),
        task({ id: 'middle', updated: '2026-06-01T00:00:00.000Z' }),
      ],
      2,
    )

    expect(withTitles).toBe(3)
    expect(rows.map((r) => r.external_id)).toEqual(['newest', 'middle'])
  })

  it('treats a limit of 0 as no cap', () => {
    const many = Array.from({ length: 120 }, (_, i) => task({ id: `t${i}` }))

    expect(toSyncRows(many, 0).rows).toHaveLength(120)
  })

  it('survives an empty read', () => {
    expect(toSyncRows([], 50)).toEqual({ rows: [], withTitles: 0 })
  })
})

describe('parseSyncLimit', () => {
  it('defaults to 50 when unset or blank', () => {
    expect(parseSyncLimit(undefined)).toBe(50)
    expect(parseSyncLimit('')).toBe(50)
  })

  it('reads a number', () => {
    expect(parseSyncLimit('10')).toBe(10)
    expect(parseSyncLimit('0')).toBe(0)
  })

  it('falls back to 50 rather than trusting garbage', () => {
    expect(parseSyncLimit('banana')).toBe(50)
    expect(parseSyncLimit('-5')).toBe(50)
  })
})

describe('requireEnv', () => {
  it('returns the value', () => {
    expect(requireEnv('SOME_KEY', { SOME_KEY: 'value' })).toBe('value')
  })

  it('names the missing var so a bad deploy is obvious', () => {
    expect(() => requireEnv('SUPABASE_SERVICE_ROLE_KEY', {})).toThrow(
      /Missing required env var: SUPABASE_SERVICE_ROLE_KEY/,
    )
  })
})
