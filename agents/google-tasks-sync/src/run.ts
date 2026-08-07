/**
 * The whole sync, with every outside system passed in.
 *
 * That's the only reason this file exists separately from the entry point: a
 * test can call runSync() with a real Zapier SDK and a real Supabase client
 * whose *network* has been faked, which is a much stronger check than swapping
 * both clients for hand-written stubs.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncConfig } from './config.ts'
import type { Logger } from './log.ts'
import { readAllGoogleTasks, type ZapierLike } from './google-tasks.ts'
import { resolveTargetUserId, type AdminClient } from './target-user.ts'
import { toSyncRows } from './todos.ts'

export type SyncDeps = {
  zapier: ZapierLike
  supabase: Pick<SupabaseClient, 'rpc'> & { auth: AdminClient }
  config: SyncConfig
  log: Logger
}

export type SyncResult = {
  /** Raw tasks read from Google (before dedupe). */
  read: number
  /** Distinct tasks with a usable title. */
  withTitles: number
  /** Rows sent to the database (after the SYNC_LIMIT cap). */
  sent: number
  /** Rows the database reported as inserted or updated. */
  upserted: number
}

export async function runSync({ zapier, supabase, config, log }: SyncDeps): Promise<SyncResult> {
  // Resolve who we're writing for before spending time on Zapier — a typo in
  // the target should fail in a second, not after reading every task list.
  const targetUserId = await resolveTargetUserId(supabase.auth, config.target, log)

  const googleTasks = await readAllGoogleTasks(zapier, {
    connectionId: config.connectionId,
    log,
  })

  const { rows, withTitles } = toSyncRows(googleTasks, config.syncLimit)

  log(
    `Read ${googleTasks.length} task(s); ${withTitles} with titles; upserting the ` +
      `latest ${rows.length}${config.syncLimit > 0 ? ` (SYNC_LIMIT=${config.syncLimit})` : ' (no cap)'} ` +
      `for user ${targetUserId}.`,
  )

  if (rows.length === 0) {
    log('Nothing to sync.')
    return { read: googleTasks.length, withTitles, sent: 0, upserted: 0 }
  }

  const { data, error } = await supabase.rpc('sync_external_todos', {
    p_user_id: targetUserId,
    p_tasks: rows,
  })
  if (error) throw new Error(`Upsert failed: ${error.message}`)

  const upserted = typeof data === 'number' ? data : Number(data ?? 0)
  log(`✓ Sync complete. Rows inserted/updated: ${upserted}`)

  return { read: googleTasks.length, withTitles, sent: rows.length, upserted }
}
