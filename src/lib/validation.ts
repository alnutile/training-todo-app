/**
 * Every input rule in the app, in one place.
 *
 * This is the classic case for unit tests: a form with several rules, where
 * adding a *new* rule is exactly the moment you break an old one. Each rule
 * gets a line in validation.test.ts, so the seventh rule can't quietly undo the
 * second.
 */

export type ValidationResult = { ok: true } | { ok: false; message: string }

const ok: ValidationResult = { ok: true }
const fail = (message: string): ValidationResult => ({ ok: false, message })

export const MAX_TITLE_LENGTH = 120
export const MIN_PASSWORD_LENGTH = 6

/** A card needs a real title — a database CHECK enforces this too. */
export function validateTitle(raw: string): ValidationResult {
  const title = raw.trim()
  if (!title) return fail('Give the task a title.')
  if (title.length > MAX_TITLE_LENGTH) {
    return fail(`Keep the title under ${MAX_TITLE_LENGTH} characters.`)
  }
  return ok
}

/**
 * Deliberately loose. The real check is the email actually arriving; this only
 * catches the typo before we bother the server.
 */
export function validateEmail(raw: string): ValidationResult {
  const email = raw.trim()
  if (!email) return fail('Enter your email.')
  if (/\s/.test(email)) return fail('Email addresses cannot contain spaces.')
  const parts = email.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return fail('That does not look like an email address.')
  }
  if (!parts[1].includes('.') || parts[1].startsWith('.') || parts[1].endsWith('.')) {
    return fail('That does not look like an email address.')
  }
  return ok
}

/** Matches the minimum Supabase Auth enforces, so the error arrives sooner. */
export function validatePassword(raw: string): ValidationResult {
  if (!raw) return fail('Enter your password.')
  if (raw.length < MIN_PASSWORD_LENGTH) {
    return fail(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  return ok
}

/** Email + password together, reporting the first problem it finds. */
export function validateCredentials(email: string, password: string): ValidationResult {
  const emailResult = validateEmail(email)
  if (!emailResult.ok) return emailResult
  return validatePassword(password)
}
