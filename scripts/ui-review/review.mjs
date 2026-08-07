#!/usr/bin/env node
/**
 * Send the captured screenshots to Claude and fail the build on what it finds.
 *
 * Deliberately the thinnest possible wrapper: read files, call the API, print
 * the report, pick an exit code. Everything worth testing lives in lib.mjs.
 *
 *   node scripts/ui-review/review.mjs [--dir ui-review/screens] [--fail-on blocker,major]
 *
 * Skips with exit 0 (and says so) when no credentials are configured, so the
 * pipeline stays green while you're still deciding whether to enable this.
 */
import Anthropic from '@anthropic-ai/sdk'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  REVIEW_SYSTEM_PROMPT,
  VERDICT_SCHEMA,
  buildContent,
  evaluate,
  renderReport,
} from './lib.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const SHOT_DIR = flag('dir', 'ui-review/screens')
const REPORT_PATH = flag('report', 'ui-review/report.md')
const FAIL_ON = flag('fail-on', 'blocker,major').split(',').map((s) => s.trim())

// Claude Opus 5. Thinking is on by default on this model; effort defaults to
// high, which is what we want for a judgement call about whether something
// looks broken.
const MODEL = 'claude-opus-5'

async function loadScreens(dir) {
  const names = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort()
  return Promise.all(
    names.map(async (file) => ({
      name: file.replace(/\.png$/, ''),
      base64: (await readFile(join(dir, file))).toString('base64'),
    })),
  )
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log(
      'UI review skipped: no ANTHROPIC_API_KEY.\n' +
        'Add it as a repository secret to turn this check on. The screenshots\n' +
        'were still captured and uploaded — you can review them by eye.',
    )
    return 0
  }

  const screens = await loadScreens(SHOT_DIR).catch(() => [])
  if (screens.length === 0) {
    console.error(`No screenshots found in ${SHOT_DIR}. The capture step must run first.`)
    return 1
  }
  console.log(`Reviewing ${screens.length} screenshot(s): ${screens.map((s) => s.name).join(', ')}`)

  const client = new Anthropic()

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Claude Opus 5's classifiers can decline a request; "default" re-runs it on
    // Anthropic's recommended fallback rather than handing us a refusal.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: REVIEW_SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    messages: [{ role: 'user', content: buildContent(screens) }],
  })

  // Check this before touching content — on a refusal, content is empty or partial.
  if (response.stop_reason === 'refusal') {
    console.error('The reviewer declined this request:', response.stop_details?.category ?? 'unknown')
    return 1
  }

  const text = response.content.find((block) => block.type === 'text')?.text ?? ''
  let result = null
  try {
    result = JSON.parse(text)
  } catch {
    console.error('Could not parse the review response as JSON:\n', text.slice(0, 2000))
  }

  const decision = evaluate(result, { failOn: FAIL_ON })
  const report = renderReport(result, decision)

  console.log('\n' + report + '\n')

  await mkdir(dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, report + '\n', 'utf8')

  // Render it into the Actions run page, not just the log.
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, report + '\n', { flag: 'a' })
  }

  return decision.ok ? 0 : 1
}

try {
  process.exitCode = await main()
} catch (err) {
  if (err instanceof Anthropic.RateLimitError) {
    console.error('Rate limited by the Claude API — try again shortly.')
  } else if (err instanceof Anthropic.AuthenticationError) {
    console.error('ANTHROPIC_API_KEY was rejected.')
  } else if (err instanceof Anthropic.APIError) {
    console.error(`Claude API error ${err.status}: ${err.message}`)
  } else {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  }
  process.exitCode = 1
}
