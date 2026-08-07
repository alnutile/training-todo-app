/**
 * Tests for the UI reviewer's decision logic.
 *
 * You cannot unit test whether Claude has good judgement. You *can* test the
 * things around it — that a blocker fails the build, that an unreadable answer
 * fails rather than passing by default, and that the report tells the truth.
 * Those are the parts that decide whether a red run means anything.
 */
import { describe, expect, it } from 'vitest'
import {
  SCREEN_BRIEFS,
  VERDICT_SCHEMA,
  buildContent,
  bySeverity,
  evaluate,
  renderReport,
} from './lib.mjs'

const clean = { verdict: 'pass', summary: 'Everything matches.', issues: [] }

const withIssue = (severity) => ({
  verdict: 'fail',
  summary: 'Something is off.',
  issues: [{ screen: 'login-screen', severity, problem: 'Footer floats mid-page.', evidence: 'Sits beside the card.' }],
})

describe('buildContent', () => {
  it('pairs every screenshot with its brief, in order', () => {
    const content = buildContent([
      { name: 'login-screen', base64: 'AAA' },
      { name: 'board-empty', base64: 'BBB' },
    ])

    const kinds = content.map((c) => c.type)
    expect(kinds).toEqual(['text', 'text', 'image', 'text', 'image'])
    expect(content[1].text).toContain(SCREEN_BRIEFS['login-screen'])
    expect(content[2].source).toEqual({ type: 'base64', media_type: 'image/png', data: 'AAA' })
  })

  it('still describes a screenshot it has no brief for', () => {
    const content = buildContent([{ name: 'something-new', base64: 'AAA' }])

    expect(content[1].text).toMatch(/No description was provided/)
  })

  it('refuses to review nothing — an empty run must not look like a pass', () => {
    expect(() => buildContent([])).toThrow(/No screenshots/)
  })
})

describe('evaluate', () => {
  it('passes a clean review', () => {
    expect(evaluate(clean)).toMatchObject({ ok: true, failing: [] })
  })

  it('fails on a blocker or a major', () => {
    expect(evaluate(withIssue('blocker')).ok).toBe(false)
    expect(evaluate(withIssue('major')).ok).toBe(false)
  })

  it('lets a minor through by default', () => {
    const decision = evaluate(withIssue('minor'))

    expect(decision.ok).toBe(true)
    expect(decision.failing).toHaveLength(0)
  })

  it('honours a stricter bar', () => {
    expect(evaluate(withIssue('minor'), { failOn: ['blocker', 'major', 'minor'] }).ok).toBe(false)
  })

  it('honours a looser bar', () => {
    expect(evaluate(withIssue('major'), { failOn: ['blocker'] }).ok).toBe(true)
  })

  it('fails closed on a response it cannot read', () => {
    // The important one: a garbled answer must never be mistaken for approval.
    for (const bad of [null, undefined, {}, { verdict: 'pass' }, { issues: [] }, 'nope']) {
      expect(evaluate(bad).ok).toBe(false)
    }
  })

  it('says how many issues cleared the bar', () => {
    const two = { verdict: 'fail', summary: '', issues: [
      { screen: 'a', severity: 'major', problem: 'p', evidence: 'e' },
      { screen: 'b', severity: 'blocker', problem: 'p', evidence: 'e' },
      { screen: 'c', severity: 'minor', problem: 'p', evidence: 'e' },
    ] }

    expect(evaluate(two).failing).toHaveLength(2)
  })
})

describe('bySeverity', () => {
  it('leads with the worst', () => {
    const sorted = bySeverity([
      { severity: 'minor' },
      { severity: 'blocker' },
      { severity: 'major' },
    ])

    expect(sorted.map((i) => i.severity)).toEqual(['blocker', 'major', 'minor'])
  })

  it('does not mutate its input', () => {
    const issues = [{ severity: 'minor' }, { severity: 'blocker' }]
    bySeverity(issues)

    expect(issues[0].severity).toBe('minor')
  })
})

describe('renderReport', () => {
  it('marks a pass', () => {
    const report = renderReport(clean, evaluate(clean))

    expect(report).toContain('✅ pass')
    expect(report).toContain('No issues reported.')
  })

  it('marks a fail and tables the issues', () => {
    const result = withIssue('major')
    const report = renderReport(result, evaluate(result))

    expect(report).toContain('❌ fail')
    expect(report).toContain('| major | `login-screen` |')
    expect(report).toContain('Footer floats mid-page.')
  })

  it('escapes pipes so one bad sentence cannot break the table', () => {
    const result = { verdict: 'fail', summary: '', issues: [
      { screen: 's', severity: 'major', problem: 'a | b', evidence: 'c\nd' },
    ] }

    const row = renderReport(result, evaluate(result)).split('\n').find((l) => l.startsWith('| major'))
    expect(row).toContain('a \\| b')
    expect(row).not.toContain('\n')
  })
})

describe('VERDICT_SCHEMA', () => {
  it('is strict enough for the API to enforce', () => {
    // Structured outputs require additionalProperties:false and explicit
    // required lists — without them the response shape isn't guaranteed.
    expect(VERDICT_SCHEMA.additionalProperties).toBe(false)
    expect(VERDICT_SCHEMA.required).toEqual(['verdict', 'summary', 'issues'])
    expect(VERDICT_SCHEMA.properties.issues.items.additionalProperties).toBe(false)
  })

  it('constrains severity to the levels evaluate() understands', () => {
    expect(VERDICT_SCHEMA.properties.issues.items.properties.severity.enum).toEqual([
      'blocker',
      'major',
      'minor',
    ])
  })
})
