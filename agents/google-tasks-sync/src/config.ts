/**
 * Env → config. Kept separate from the sync itself so tests can build a config
 * object directly instead of mutating process.env.
 */

export type SyncConfig = {
  supabaseUrl: string
  serviceRoleKey: string
  targetUserId: string
  connectionId: string
  /** 0 = no cap. */
  syncLimit: number
}

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

export function loadConfig(env: Env = process.env): SyncConfig {
  return {
    supabaseUrl: requireEnv('SUPABASE_URL', env),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY', env),
    targetUserId: requireEnv('SYNC_TARGET_USER_ID', env),
    connectionId: requireEnv('GOOGLE_TASKS_CONNECTION_ID', env),
    syncLimit: parseSyncLimit(env.SYNC_LIMIT),
  }
}
