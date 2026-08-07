import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { validateCredentials, validateEmail } from '../lib/validation'

type Mode = 'signin' | 'signup'

export function Auth() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Magic links + post-login land back on whatever origin we're on, so the same
  // build works in dev and prod. The origin must be in Supabase's allowed
  // Redirect URLs (see README).
  const redirectTo = window.location.origin

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    // Catch the obvious problems here so a typo doesn't become a round trip.
    const valid = validateCredentials(email, password)
    if (!valid.ok) {
      setError(valid.message)
      setNotice(null)
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const fn =
      mode === 'signin'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password })
    const { error: authError } = await fn
    if (authError) {
      setError(authError.message)
    } else if (mode === 'signup') {
      // Email confirmation is off, so sign-up returns a session and the auth
      // listener swaps to the board automatically.
      setNotice('Account created — signing you in…')
    }
    setBusy(false)
  }

  async function handleMagicLink() {
    const valid = validateEmail(email)
    if (!valid.ok) {
      setError(valid.message)
      setNotice(null)
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })
    if (otpError) {
      setError(otpError.message)
    } else {
      setNotice(`Magic link sent to ${email}. Check your inbox.`)
    }
    setBusy(false)
  }

  return (
    <div className="auth">
      <h1>To-Do</h1>
      <p className="muted">
        {mode === 'signin' ? 'Sign in to your board.' : 'Create an account.'}
      </p>

      {error && <p className="error">⚠ {error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {/* noValidate: our own rules run instead of the browser's, so the message
          is consistent everywhere and can be unit tested. */}
      <form className="auth-form" onSubmit={handlePassword} noValidate>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={
              mode === 'signin' ? 'current-password' : 'new-password'
            }
            minLength={6}
            required
          />
        </label>

        <button type="submit" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        className="link-btn"
        disabled={busy}
        onClick={handleMagicLink}
      >
        Email me a magic link instead
      </button>

      <p className="auth-switch">
        {mode === 'signin' ? (
          <>
            No account?{' '}
            <button type="button" onClick={() => setMode('signup')}>
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => setMode('signin')}>
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  )
}
