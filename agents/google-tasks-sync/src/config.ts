/**
 * Env → config. Kept separate from the sync itself so tests can build a config
 * object directly instead of mutating process.env.
 */

export type SyncConfig = {
  supabaseUrl: string
  serviceRoleKey: string
  /** Whose board to write to — a user id, or an email we look up. */
  target: SyncTarget
  connectionId: string
  /** 0 = no cap. */
  syncLimit: number
}

/**
 * Two ways to say who owns the synced tasks.
 *
 * The id is what actually gets written. The email exists because nobody knows
 * their own auth UUID, and having to go dig it out of a dashboard is a silly
 * reason for a sync to be hard to run.
 */
export type SyncTarget = { kind: 'id'; userId: string } | { kind: 'email'; email: string }

export type Env = Record<string, string | undefined>

export function requireEnv(name: string, env: Env = process.env): string {
  const value = env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

/**
 * How many of the most-recently-updated tasks to sync. Default 50 (keeps the
 * demo board tidy); 0 means no cap. Anything unparseable falls back to 50
 * rather than syncing an unbounded amount by accident.
 */
export function parseSyncLimit(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 50
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 50
}

/**
 * SYNC_TARGET_USER_ID wins if both are set — an explicit id is never ambiguous,
 * and two accounts can share an email across providers.
 */
export function resolveTarget(env: Env = process.env): SyncTarget {
  const userId = env.SYNC_TARGET_USER_ID?.trim()
  if (userId) return { kind: 'id', userId }

  const email = env.SYNC_TARGET_EMAIL?.trim()
  if (email) return { kind: 'email', email }

  throw new Error('Set SYNC_TARGET_USER_ID or SYNC_TARGET_EMAIL — the agent needs to know whose board to write to.')
}

export function loadConfig(env: Env = process.env): SyncConfig {
  return {
    supabaseUrl: requireEnv('SUPABASE_URL', env),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY', env),
    target: resolveTarget(env),
    connectionId: requireEnv('GOOGLE_TASKS_CONNECTION_ID', env),
    syncLimit: parseSyncLimit(env.SYNC_LIMIT),
  }
}
