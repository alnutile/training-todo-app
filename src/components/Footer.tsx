import { version } from '../lib/version'

/**
 * "Which version am I looking at?"
 *
 * Shows the commit this build came from and links straight to it on GitHub, so
 * you can see a deploy land — the hash changes — and click through to the exact
 * diff that changed it.
 */
export function Footer() {
  return (
    <footer className="site-footer">
      <span className="site-footer-label">deployed</span>{' '}
      <a
        className="site-footer-link"
        href={version.url}
        target="_blank"
        rel="noreferrer"
        title={version.known ? `Commit ${version.sha}` : 'Local build — no commit behind it'}
      >
        <code>{version.short}</code>
      </a>
      {!version.known && <span className="site-footer-note"> (local build)</span>}
    </footer>
  )
}
