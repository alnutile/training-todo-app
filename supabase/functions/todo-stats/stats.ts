/**
 * Pure summarising logic for the todo-stats function.
 *
 * No Deno, no fetch, no request — just rows in, summary out. That's what makes
 * it testable in a millisecond.
 */

export const LANES = ['backlog', 'next', 'in_progress', 'done'] as const

export type Lane = (typeof LANES)[number]

export type TodoRow = { status?: string | null }

export type Stats = {
  total: number
  done: number
  /** Whole-percent complete. 0 when the board is empty (never NaN). */
  pct: number
  byLane: Record<Lane, number>
}

function emptyLanes(): Record<Lane, number> {
  return { backlog: 0, next: 0, in_progress: 0, done: 0 }
}

export function isLane(value: unknown): value is Lane {
  return typeof value === 'string' && (LANES as readonly string[]).includes(value)
}

export function summarize(rows: TodoRow[]): Stats {
  const byLane = emptyLanes()

  for (const row of rows) {
    // A row with a status we don't recognise is counted in the total but not
    // in a lane — better than crashing if the enum grows before this deploys.
    if (isLane(row.status)) byLane[row.status] += 1
  }

  const total = rows.length
  const done = byLane.done

  return { total, done, pct: total ? Math.round((done / total) * 100) : 0, byLane }
}
