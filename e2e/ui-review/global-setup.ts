/**
 * Seed the account the UI review signs in as.
 *
 * This runs against the throwaway Supabase — real Auth, real Postgres — so the
 * screenshots downstream are of the app in the state a person actually sees it,
 * not a mocked approximation.
 */
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL, REVIEW_EMAIL, REVIEW_PASSWORD } from './fixtures'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

async function ensureUser(): Promise<void> {
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required to seed the review account.\n' +
        'Locally:  export $(supabase status -o env | grep SERVICE_ROLE_KEY | sed "s/SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY/")',
    )
  }

  // Idempotent: a second run just gets "user already registered", which is fine.
  const response = await fetch(`${LOCAL_SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: REVIEW_EMAIL,
      password: REVIEW_PASSWORD,
      email_confirm: true,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    if (!/already been registered|already exists/i.test(body)) {
      throw new Error(`Could not seed the review account (HTTP ${response.status}): ${body}`)
    }
  }
}

async function checkReachable(): Promise<void> {
  const response = await fetch(`${LOCAL_SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: LOCAL_ANON_KEY },
  }).catch(() => null)

  if (!response?.ok) {
    throw new Error(
      `No Supabase at ${LOCAL_SUPABASE_URL}. Run \`supabase start\` first — ` +
        'this suite deliberately does not mock the backend.',
    )
  }
}

export default async function globalSetup(): Promise<void> {
  await checkReachable()
  await ensureUser()
}
