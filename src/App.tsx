import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { Auth } from './components/Auth'
import { Board } from './components/Board'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  // Track the auth session. onAuthStateChange also fires after a magic-link
  // redirect lands back on the page, so the board appears automatically.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <main className="app">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  // No session → login screen, never the board (incognito gets bounced here).
  if (!session) {
    return (
      <main className="app app--auth">
        <Auth />
      </main>
    )
  }

  return (
    <main className="app">
      <header className="app-bar">
        <h1>To-Do</h1>
        <div className="app-bar-right">
          <span className="muted email">{session.user.email}</span>
          <button
            type="button"
            className="signout"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <Board userId={session.user.id} />
    </main>
  )
}
