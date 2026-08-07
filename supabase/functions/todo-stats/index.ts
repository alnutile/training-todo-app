/**
 * todo-stats — a Supabase Edge Function (Deno).
 *
 * GET/POST with the caller's `Authorization: Bearer <jwt>` and it answers with
 * that user's board summary:
 *
 *   { "total": 8, "done": 3, "pct": 38,
 *     "byLane": { "backlog": 3, "next": 1, "in_progress": 1, "done": 3 } }
 *
 * This file only wires up the environment. The logic — and its tests — live in
 * handler.ts and stats.ts, so CI can check the function without deploying it.
 *
 * Deploys from .github/workflows/deploy-production.yml, on main only.
 */
import { handleRequest } from './handler.ts'

// SUPABASE_URL and SUPABASE_ANON_KEY are injected into every Edge Function by
// the platform. Note what's *not* here: no service_role key — this function
// works as the caller, under RLS.
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

if (import.meta.main) {
  Deno.serve((req) => handleRequest(req, { fetch: globalThis.fetch, supabaseUrl, anonKey }))
}
