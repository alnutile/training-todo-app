/**
 * Turn "whose board?" into a user id.
 *
 * Looking a user up by email needs the admin API, which needs the service_role
 * key — which this agent already has and the browser never will. That's the
 * whole reason this lives server-side.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncTarget } from './config.ts'
import type { Logger } from './log.ts'

export type AdminClient = Pick<SupabaseClient['auth'], never> & {
  admin: {
    listUsers(params?: { page?: number; perPage?: number }): Promise<{
      data: { users: Array<{ id: string; email?: string | null }> }
      error: { message: string } | null
    }>
  }
}

export async function resolveTargetUserId(
  auth: AdminClient,
  target: SyncTarget,
  log: Logger,
): Promise<string> {
  if (target.kind === 'id') return target.userId

  const wanted = target.email.toLowerCase()
  const { data, error } = await auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`Could not look up ${target.email}: ${error.message}`)

  const match = data.users.find((u) => (u.email ?? '').toLowerCase() === wanted)
  if (!match) {
    // Almost always "I haven't signed up on this project yet", so say that
    // rather than making someone read a stack trace.
    throw new Error(
      `No account found for ${target.email}. Sign in to the app with that ` +
        `address first, or set SYNC_TARGET_USER_ID directly.`,
    )
  }

  log(`Syncing to ${target.email} (${match.id}).`)
  return match.id
}
