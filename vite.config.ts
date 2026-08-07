import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The commit this bundle was built from, baked in so the running app can show
 * it (see src/lib/version.ts).
 *
 * Each host tells you a different way:
 *   VITE_COMMIT_SHA        — set it yourself, wins over everything
 *   RAILWAY_GIT_COMMIT_SHA — Railway sets this on every deploy
 *   GITHUB_SHA             — GitHub Actions sets this on every run
 *   git rev-parse HEAD     — a laptop
 *   'dev'                  — none of the above, and saying so is better than lying
 */
function resolveCommitSha(): string {
  const fromEnv =
    process.env.VITE_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA
  if (fromEnv) return fromEnv.trim()

  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    // No git, or not a repo (a Docker build, say). Not worth failing over.
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(resolveCommitSha()),
  },
  preview: {
    // Railway serves the app behind its own *.up.railway.app domain (and any
    // custom domain you add). Vite's preview server blocks unknown hosts by
    // default, so allow them here. The app ships no secrets, so this is safe.
    host: true,
    allowedHosts: true,
  },
})
