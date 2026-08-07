import { describe, expect, it } from 'vitest'
import { describeVersion, REPO_URL } from './version'

describe('describeVersion', () => {
  const sha = 'a405efa1b2c3d4e5f60718293a4b5c6d7e8f9012'

  it('shortens the sha the way git does', () => {
    expect(describeVersion(sha).short).toBe('a405efa')
  })

  it('links to the exact commit', () => {
    expect(describeVersion(sha).url).toBe(`${REPO_URL}/commit/${sha}`)
  })

  it('keeps the full sha for the tooltip', () => {
    expect(describeVersion(sha).sha).toBe(sha)
  })

  it('falls back to the repo when there is no commit', () => {
    for (const missing of [undefined, '', '   ', 'dev']) {
      const v = describeVersion(missing)
      expect(v.known).toBe(false)
      expect(v.short).toBe('dev')
      expect(v.url).toBe(REPO_URL)
    }
  })

  it('ignores surrounding whitespace from a shell variable', () => {
    expect(describeVersion(`  ${sha}\n`).short).toBe('a405efa')
  })

  it('copes with a sha that is already short', () => {
    expect(describeVersion('a405efa')).toMatchObject({ short: 'a405efa', known: true })
  })
})
