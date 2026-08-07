/**
 * Unit tests for the board rules — including the realtime reconciliation that
 * makes two tabs agree. Testing that here means we don't need two real browser
 * tabs and a live websocket to know it still works.
 */
import { describe, expect, it } from 'vitest'
import type { Status, Todo } from '../types'
import {
  applyRealtimeEvent,
  laneTodos,
  nextPosition,
  progress,
  toggledStatus,
  withMove,
} from './board'

let seq = 0
function todo(over: Partial<Todo> & { title?: string } = {}): Todo {
  seq += 1
  return {
    id: `t${seq}`,
    user_id: 'user-1',
    title: over.title ?? `Task ${seq}`,
    notes: null,
    status: 'backlog' as Status,
    position: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('nextPosition', () => {
  it('starts at 1 in an empty lane', () => {
    expect(nextPosition([], 'next')).toBe(1)
    expect(nextPosition([todo({ status: 'backlog', position: 9 })], 'next')).toBe(1)
  })

  it('puts a card at the end of the target lane', () => {
    const todos = [
      todo({ status: 'next', position: 1 }),
      todo({ status: 'next', position: 4 }),
      todo({ status: 'done', position: 99 }),
    ]

    // 99 is in another lane and must not drag the new position with it.
    expect(nextPosition(todos, 'next')).toBe(5)
  })
})

describe('laneTodos', () => {
  it('returns only that lane, ordered by position', () => {
    const a = todo({ status: 'in_progress', position: 3, title: 'third' })
    const b = todo({ status: 'in_progress', position: 1, title: 'first' })
    const c = todo({ status: 'done', position: 2, title: 'elsewhere' })

    expect(laneTodos([a, b, c], 'in_progress').map((t) => t.title)).toEqual(['first', 'third'])
  })

  it('does not mutate the list it was given', () => {
    const todos = [todo({ status: 'next', position: 2 }), todo({ status: 'next', position: 1 })]
    const before = todos.map((t) => t.id)

    laneTodos(todos, 'next')

    expect(todos.map((t) => t.id)).toEqual(before)
  })
})

describe('progress', () => {
  it('is 0% with nothing on the board', () => {
    expect(progress([])).toEqual({ total: 0, done: 0, pct: 0 })
  })

  it('counts only the done lane', () => {
    const todos = [
      todo({ status: 'done' }),
      todo({ status: 'done' }),
      todo({ status: 'backlog' }),
      todo({ status: 'in_progress' }),
    ]

    expect(progress(todos)).toEqual({ total: 4, done: 2, pct: 50 })
  })

  it('rounds to a whole percent', () => {
    expect(progress([todo({ status: 'done' }), todo(), todo()]).pct).toBe(33)
  })
})

describe('toggledStatus', () => {
  it('sends an unfinished card to done', () => {
    expect(toggledStatus(todo({ status: 'in_progress' }))).toBe('done')
  })

  it('sends a done card back to backlog', () => {
    expect(toggledStatus(todo({ status: 'done' }))).toBe('backlog')
  })
})

describe('withMove', () => {
  it('moves one card to the end of its new lane', () => {
    const moving = todo({ status: 'backlog', position: 1 })
    const parked = todo({ status: 'done', position: 7 })

    const moved = withMove([moving, parked], moving.id, 'done')

    expect(moved[0]).toMatchObject({ status: 'done', position: 8 })
    expect(moved[1]).toEqual(parked)
  })

  it('leaves the original list alone (no in-place mutation)', () => {
    const card = todo({ status: 'backlog', position: 1 })
    const todos = [card]

    withMove(todos, card.id, 'done')

    expect(todos[0].status).toBe('backlog')
  })
})

describe('applyRealtimeEvent', () => {
  it('adds a card another tab created', () => {
    const existing = todo()
    const fromOtherTab = todo({ title: 'Made in tab two' })

    const next = applyRealtimeEvent([existing], { eventType: 'INSERT', new: fromOtherTab })

    expect(next.map((t) => t.title)).toEqual([existing.title, 'Made in tab two'])
  })

  it('ignores an INSERT for a card we already have', () => {
    // The tab that made the change gets its own INSERT broadcast back. Without
    // this guard you'd see the card twice in the tab you're looking at.
    const card = todo()

    expect(applyRealtimeEvent([card], { eventType: 'INSERT', new: card })).toHaveLength(1)
  })

  it('replaces a card another tab moved', () => {
    const card = todo({ status: 'backlog', position: 1 })
    const movedElsewhere = { ...card, status: 'done' as Status, position: 4 }

    const next = applyRealtimeEvent([card], { eventType: 'UPDATE', new: movedElsewhere })

    expect(next[0]).toMatchObject({ status: 'done', position: 4 })
  })

  it('ignores an UPDATE for a card we do not have', () => {
    const mine = todo()

    const next = applyRealtimeEvent([mine], { eventType: 'UPDATE', new: todo() })

    expect(next).toEqual([mine])
  })

  it('removes a card another tab deleted', () => {
    const keep = todo()
    const remove = todo()

    const next = applyRealtimeEvent([keep, remove], { eventType: 'DELETE', old: { id: remove.id } })

    expect(next).toEqual([keep])
  })

  it('survives a DELETE payload with no id', () => {
    // REPLICA IDENTITY FULL should always give us the old row, but a dropped
    // payload must not wipe the board.
    const todos = [todo(), todo()]

    expect(applyRealtimeEvent(todos, { eventType: 'DELETE', old: {} })).toHaveLength(2)
  })
})
