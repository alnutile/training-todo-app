/**
 * Unit tests for the form rules.
 *
 * This is the file to point at when someone asks "why bother testing a to-do
 * app?" — every rule is one line, and the seventh rule you add can't quietly
 * break the second one.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_TITLE_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateCredentials,
  validateEmail,
  validatePassword,
  validateTitle,
} from './validation'

describe('validateTitle', () => {
  it('accepts a normal title', () => {
    expect(validateTitle('Ship the video')).toEqual({ ok: true })
  })

  it('rejects an empty or whitespace-only title', () => {
    expect(validateTitle('')).toMatchObject({ ok: false })
    expect(validateTitle('    ')).toMatchObject({ ok: false })
  })

  it('accepts a title right at the limit but not past it', () => {
    expect(validateTitle('x'.repeat(MAX_TITLE_LENGTH))).toEqual({ ok: true })
    expect(validateTitle('x'.repeat(MAX_TITLE_LENGTH + 1))).toMatchObject({ ok: false })
  })

  it('measures the trimmed title, not the padding', () => {
    expect(validateTitle(`  ${'x'.repeat(MAX_TITLE_LENGTH)}  `)).toEqual({ ok: true })
  })

  it('explains what to do', () => {
    const result = validateTitle('')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/title/i)
  })
})

describe('validateEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(validateEmail('you@example.com')).toEqual({ ok: true })
    expect(validateEmail('first.last+tag@mail.example.co.uk')).toEqual({ ok: true })
  })

  it('ignores surrounding whitespace', () => {
    expect(validateEmail('  you@example.com  ')).toEqual({ ok: true })
  })

  it('rejects the usual typos', () => {
    expect(validateEmail('')).toMatchObject({ ok: false })
    expect(validateEmail('you-at-example.com')).toMatchObject({ ok: false })
    expect(validateEmail('you@example')).toMatchObject({ ok: false })
    expect(validateEmail('@example.com')).toMatchObject({ ok: false })
    expect(validateEmail('you@')).toMatchObject({ ok: false })
    expect(validateEmail('you@@example.com')).toMatchObject({ ok: false })
    expect(validateEmail('you@example.')).toMatchObject({ ok: false })
    expect(validateEmail('you name@example.com')).toMatchObject({ ok: false })
  })
})

describe('validatePassword', () => {
  it('accepts a long enough password', () => {
    expect(validatePassword('x'.repeat(MIN_PASSWORD_LENGTH))).toEqual({ ok: true })
  })

  it('rejects a short or missing one', () => {
    expect(validatePassword('')).toMatchObject({ ok: false })
    expect(validatePassword('x'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatchObject({ ok: false })
  })

  it('never trims a password — spaces are legitimate characters', () => {
    expect(validatePassword('      ')).toEqual({ ok: true })
  })
})

describe('validateCredentials', () => {
  it('passes when both are fine', () => {
    expect(validateCredentials('you@example.com', 'hunter2!')).toEqual({ ok: true })
  })

  it('reports the email problem first', () => {
    const result = validateCredentials('nope', 'short')
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toMatch(/email/i)
  })

  it('falls through to the password when the email is fine', () => {
    const result = validateCredentials('you@example.com', 'short')
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toMatch(/password/i)
  })
})
