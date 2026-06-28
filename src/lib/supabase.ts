import { createClient } from '@supabase/supabase-js'

// Only VITE_-prefixed vars reach the browser — these are PUBLIC by design.
// The anon/publishable key is safe client-side; the service_role key must NEVER
// appear here (see CLAUDE.md + .env.example).
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
