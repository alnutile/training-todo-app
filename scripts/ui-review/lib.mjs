/**
 * The thinking parts of the UI review, with no network and no filesystem.
 *
 * Everything here is input-in/output-out so it can be tested without an API key
 * — which matters, because the one thing you cannot unit test is whether Claude
 * has good taste. What you *can* test is that a blocker fails the build, that a
 * malformed response doesn't pass by accident, and that the report says what
 * happened.
 */

/** What each screenshot is supposed to show. Keys match the PNG filenames. */
export const SCREEN_BRIEFS = {
  'login-screen':
    'The signed-out login screen. Expect a centred card with the To-Do heading, ' +
    'email and password fields, a primary Sign in button, a magic-link link, and ' +
    'a link to create an account. A small "deployed <commit>" footer belongs at ' +
    'the BOTTOM of the page.',
  'board-empty':
    'The board immediately after signing in, with no cards. Expect four lanes — ' +
    'Backlog, Next, In Progress, Done — each with an add-a-task box and a "Drop ' +
    'tasks here" placeholder, plus a header reading "0 of 0 tasks complete".',
  'board-with-cards':
    'The board with four cards spread across Backlog, Next and Done, one of them ' +
    'ticked off. Expect the progress bar and "1 of 4 tasks complete · 25% done".',
  'board-validation-error':
    'The board after submitting the Backlog add-task box while empty. Expect a ' +
    'short inline validation message directly under that lane\'s input.',
  'login-error':
    'The login screen after a failed sign-in. Expect an error message about ' +
    'invalid credentials, near the top of the card, without the form disappearing.',
}

export const REVIEW_SYSTEM_PROMPT = `You are reviewing screenshots of a small to-do board web app as part of its CI pipeline.

Judge only what you can see. For each screenshot you are told what it is supposed to show; compare the image to that description and report where the rendered page is wrong or would confuse a user.

Look for:
- Elements in obviously wrong positions — floating in dead space, overlapping, escaping their container, or vertically centred when they should be at the top or bottom.
- Content that is cut off, clipped, or pushed off-screen.
- Text that is unreadable against its background, or badly misaligned.
- Controls that are missing, duplicated, or visually broken.
- Layout that is plainly inconsistent between lanes, cards, or repeated elements.

Do NOT report:
- Subjective taste: colour choices, font preferences, spacing you would have done differently, or "it could look more modern".
- Anything you are guessing at rather than seeing.
- Absence of features the description never claimed.

Severity:
- "blocker": the screen is unusable or a described element is missing entirely.
- "major": clearly wrong and a user would notice — misplaced, overlapping, or cut-off content.
- "minor": visibly off but harmless — small misalignment, inconsistent padding.

Report every issue you actually see, with its severity. An empty issues list is the correct answer for a screen that matches its description — do not invent findings to seem thorough.`

/** Schema the model's answer is constrained to, so parsing can't fail. */
export const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['pass', 'fail'],
      description: 'fail if any blocker or major issue was found, otherwise pass',
    },
    summary: {
      type: 'string',
      description: 'One or two sentences on the overall state of the UI.',
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          screen: { type: 'string', description: 'The screenshot name it appears on.' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          problem: { type: 'string', description: 'What is wrong, in one sentence.' },
          evidence: {
            type: 'string',
            description: 'What in the image shows it — position, overlap, what is cut off.',
          },
        },
        required: ['screen', 'severity', 'problem', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'summary', 'issues'],
  additionalProperties: false,
}

const SEVERITY_RANK = { blocker: 0, major: 1, minor: 2 }

/**
 * Build the user-turn content: one labelled brief per screenshot, each followed
 * by the image itself.
 */
export function buildContent(screens) {
  if (screens.length === 0) {
    throw new Error('No screenshots to review — did the capture step run?')
  }

  const content = [
    {
      type: 'text',
      text:
        `Review ${screens.length} screenshot(s) of the app. Each is introduced by ` +
        `its name and what it is supposed to show.`,
    },
  ]

  for (const screen of screens) {
    const brief = SCREEN_BRIEFS[screen.name] ?? 'No description was provided for this screen.'
    content.push({ type: 'text', text: `\n## ${screen.name}\n${brief}` })
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: screen.base64 },
    })
  }

  return content
}

/**
 * Decide whether the run fails the build.
 *
 * The severity list is the gate, not the model's own verdict — so "fail on
 * blockers only" is a config change here rather than a prompt rewrite. A
 * response we can't understand fails too: silence must never read as approval.
 */
export function evaluate(result, { failOn = ['blocker', 'major'] } = {}) {
  if (!result || !Array.isArray(result.issues) || typeof result.verdict !== 'string') {
    return {
      ok: false,
      reason: 'The reviewer returned something this script could not read.',
      failing: [],
    }
  }

  const failing = result.issues.filter((issue) => failOn.includes(issue.severity))

  return {
    ok: failing.length === 0,
    reason: failing.length === 0 ? 'No blocking issues found.' : `${failing.length} issue(s) at or above the bar.`,
    failing,
  }
}

/** Sort issues worst-first so the report leads with what matters. */
export function bySeverity(issues) {
  return [...issues].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99),
  )
}

/** The Markdown that lands in the GitHub Actions job summary. */
export function renderReport(result, decision) {
  const lines = [`## UI review — ${decision.ok ? '✅ pass' : '❌ fail'}`, '']

  if (result?.summary) lines.push(result.summary, '')

  const issues = Array.isArray(result?.issues) ? bySeverity(result.issues) : []

  if (issues.length === 0) {
    lines.push('No issues reported.')
  } else {
    lines.push('| Severity | Screen | Problem | Evidence |', '|---|---|---|---|')
    for (const issue of issues) {
      lines.push(
        `| ${issue.severity} | \`${issue.screen}\` | ${escapeCell(issue.problem)} | ${escapeCell(issue.evidence)} |`,
      )
    }
  }

  lines.push('', `_${decision.reason}_`, '', 'Screenshots are attached to this run as an artifact.')
  return lines.join('\n')
}

function escapeCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}
