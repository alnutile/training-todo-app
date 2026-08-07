/**
 * Board rules, as plain functions.
 *
 * These used to live inside the Board component. Pulled out here they're
 * testable without rendering anything, without a browser, and without a
 * database — which means the rules that decide where a card lands, and how a
 * second tab catches up, are checked on every push.
 */
import type { Status, Todo } from '../types'

/** Where a card dropped into `status` should sit: the end of that lane. */
export function nextPosition(todos: Todo[], status: Status): number {
  const inLane = todos.filter((t) => t.status === status)
  if (inLane.length === 0) return 1
  return Math.max(...inLane.map((t) => t.position)) + 1
}

/** The cards in one lane, in the order they should render. */
export function laneTodos(todos: Todo[], status: Status): Todo[] {
  return todos.filter((t) => t.status === status).sort((a, b) => a.position - b.position)
}

export type Progress = { total: number; done: number; pct: number }

/** The "3 of 8 tasks complete · 38% done" line. */
export function progress(todos: Todo[]): Progress {
  const total = todos.length
  const done = todos.filter((t) => t.status === 'done').length
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}

/** Checking a card sends it to Done; unchecking sends it back to Backlog. */
export function toggledStatus(todo: Todo): Status {
  return todo.status === 'done' ? 'backlog' : 'done'
}

/** Move a card locally (optimistic), before the database confirms it. */
export function withMove(todos: Todo[], id: string, status: Status): Todo[] {
  const position = nextPosition(todos, status)
  return todos.map((t) => (t.id === id ? { ...t, status, position } : t))
}

export type RealtimeEvent =
  | { eventType: 'INSERT'; new: Todo }
  | { eventType: 'UPDATE'; new: Todo }
  | { eventType: 'DELETE'; old: Partial<Todo> }

/**
 * Fold a realtime event into the list we're showing. This is what makes two
 * tabs agree.
 *
 * The INSERT de-dupe is the subtle one: the tab that *made* the change may
 * already have the row, and Postgres will still broadcast the INSERT to it.
 * Without the guard you get a phantom duplicate card in the tab you're using.
 */
export function applyRealtimeEvent(todos: Todo[], event: RealtimeEvent): Todo[] {
  switch (event.eventType) {
    case 'INSERT': {
      if (todos.some((t) => t.id === event.new.id)) return todos
      return [...todos, event.new]
    }
    case 'UPDATE':
      return todos.map((t) => (t.id === event.new.id ? event.new : t))
    case 'DELETE':
      return todos.filter((t) => t.id !== event.old.id)
    default:
      return todos
  }
}
