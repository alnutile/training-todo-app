/**
 * These messages exist because both failures cost real time to work out, and
 * neither one says what it actually is. Worth keeping them accurate.
 */
import { describe, expect, it } from 'vitest'
import { explainFailure } from '../src/errors.ts'

describe('explainFailure', () => {
  it('recognises the approval denial and names the real fix', () => {
    // What the SDK actually throws when you use a `zapier-sdk login` token in a
    // script: it reads like a permissions problem, but the credentials type is
    // the cause.
    const err = Object.assign(
      new Error('Request denied by policy: can_execute on action/GoogleTasksCLIAPI@latest/read/list_task_lists'),
      { name: 'ZapierApprovalError' },
    )

    const help = explainFailure(err)

    expect(help).toContain('create-client-credentials')
    expect(help).toContain('--allowed-scopes external')
    expect(help).toContain('ZAPIER_CREDENTIALS_CLIENT_ID')
  })

  it('matches on the error name alone, not just the message', () => {
    const err = Object.assign(new Error('something opaque'), { name: 'ZapierApprovalError' })

    expect(explainFailure(err)).toContain('create-client-credentials')
  })

  it('recognises an authentication failure', () => {
    const err = new Error('Authentication required (HTTP 401). Please provide credentials in options')

    const help = explainFailure(err)

    expect(help).toContain('zapier-sdk login')
    expect(help).toContain('ZAPIER_CREDENTIALS_CLIENT_SECRET')
  })

  it('stays quiet about errors it has no advice for', () => {
    expect(explainFailure(new Error('Upsert failed: duplicate key'))).toBeNull()
    expect(explainFailure('some string')).toBeNull()
    expect(explainFailure(undefined)).toBeNull()
  })
})
