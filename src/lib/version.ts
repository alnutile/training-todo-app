/**
 * Which commit is this, exactly?
 *
 * The sha is baked in at build time (see vite.config.ts), so the running app
 * can tell you what it was built from. That turns "did my change actually
 * deploy?" from a guess into something you read off the page.
 *
 * Where the value comes from, in order: an explicit VITE_COMMIT_SHA, Railway's
 * or GitHub's own build variable, or `git rev-parse` on a laptop. If none of
 * those exist it says "dev", which is the honest answer.
 */

export const REPO_URL = 'https://github.com/alnutile/training-todo-app'

export type Version = {
  /** Full sha, or 'dev' when built outside CI without git. */
  sha: string
  /** What's shown on screen — 7 chars, like git does. */
  short: string
  /** Link to this exact commit, or the repo when we don't know the commit. */
  url: string
  /** False when this is a local build with no commit behind it. */
  known: boolean
}

const UNKNOWN = 'dev'

export function describeVersion(rawSha: string | undefined): Version {
  const sha = (rawSha ?? '').trim()

  if (!sha || sha === UNKNOWN) {
    return { sha: UNKNOWN, short: UNKNOWN, url: REPO_URL, known: false }
  }

  return {
    sha,
    short: sha.slice(0, 7),
    url: `${REPO_URL}/commit/${sha}`,
    known: true,
  }
}

/** The version of the build that's actually running. */
export const version: Version = describeVersion(import.meta.env.VITE_COMMIT_SHA)
