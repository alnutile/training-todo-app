/**
 * Turn the agent's two most common failures into instructions.
 *
 * Both of these cost real time to diagnose the first time, and both look like
 * something else: one reads as a permissions bug, the other as a crash. A stack
 * trace is the wrong answer when the fix is one line of .env.
 */

const APPROVAL_HELP = [
  'Zapier refused to execute the action.',
  '',
  'This is almost always the credentials, not the connection. The token from',
  '`zapier-sdk login` is gated behind per-action approval, so any run without a',
  'human sitting there — a cron job, a script, CI — gets denied.',
  '',
  'Use client credentials instead, which are not approval-gated:',
  '',
  '  npx -p @zapier/zapier-sdk-cli zapier-sdk create-client-credentials \\',
  '    "todo-sync-agent" --allowed-scopes external --json',
  '',
  'then set ZAPIER_CREDENTIALS_CLIENT_ID and ZAPIER_CREDENTIALS_CLIENT_SECRET.',
].join('\n')

const AUTH_HELP = [
  'Zapier could not authenticate this run.',
  '',
  'Either log in for a local run:',
  '  npx -p @zapier/zapier-sdk-cli zapier-sdk login',
  '',
  'or set ZAPIER_CREDENTIALS_CLIENT_ID / ZAPIER_CREDENTIALS_CLIENT_SECRET for an',
  'unattended one (see create-client-credentials, scope "external").',
].join('\n')

/** Extra guidance to print after the error, or nothing when we have none. */
export function explainFailure(err: unknown): string | null {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err)

  if (/approval|can_execute|denied by policy/i.test(text)) return APPROVAL_HELP
  if (/authentication required|401|unauthorized/i.test(text)) return AUTH_HELP

  return null
}
