/**
 * Pure task-shaping logic: Google Tasks in, `todos` rows out.
 *
 * Nothing in here touches the network or the clock, so it's the cheapest thing
 * in the repo to test — one input shape, one output shape, no mocking needed.
 */

export type GoogleTask = {
  id: string
  title?: string
  status?: string
  /** ISO 8601 from Google. String compare orders it correctly. */
  updated?: string
}

export type SyncRow = {
  external_id: string
  title: string
  status: 'backlog' | 'done'
}

export type ShapedTasks = {
  rows: SyncRow[]
  /** How many distinct tasks had a usable title, before the limit was applied. */
  withTitles: number
}

/** Google Tasks status -> our lane. Anything not `completed` lands in backlog. */
export function mapStatus(googleStatus?: string): 'backlog' | 'done' {
  return googleStatus === 'completed' ? 'done' : 'backlog'
}

/**
 * Dedupe (keep the most recently updated copy of an id), drop untitled tasks,
 * sort newest first, then cap to `limit` (0 = no cap).
 *
 * Deduping matters: a single upsert payload must never hit the same conflict
 * row twice, or Postgres rejects the whole statement.
 */
export function toSyncRows(tasks: GoogleTask[], limit: number): ShapedTasks {
  const byId = new Map<string, GoogleTask>()
  for (const task of tasks) {
    if (!(task.title ?? '').trim()) continue
    const existing = byId.get(task.id)
    if (!existing || (task.updated ?? '') > (existing.updated ?? '')) {
      byId.set(task.id, task)
    }
  }

  const sorted = [...byId.values()].sort((a, b) =>
    (b.updated ?? '').localeCompare(a.updated ?? ''),
  )
  const picked = limit > 0 ? sorted.slice(0, limit) : sorted

  return {
    withTitles: sorted.length,
    rows: picked.map((task) => ({
      external_id: task.id,
      title: task.title!.trim(),
      status: mapStatus(task.status),
    })),
  }
}
