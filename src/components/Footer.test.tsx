import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { REPO_URL } from '../lib/version'
import { Footer } from './Footer'

// vitest.config.ts pins VITE_COMMIT_SHA so this is deterministic.
const TEST_SHA = 'abcdef1234567890abcdef1234567890abcdef12'

describe('Footer', () => {
  it('shows the short commit the build came from', () => {
    render(<Footer />)

    expect(screen.getByText('abcdef1')).toBeInTheDocument()
  })

  it('links to that exact commit on GitHub', () => {
    render(<Footer />)

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', `${REPO_URL}/commit/${TEST_SHA}`)
    // Opening the repo shouldn't navigate away from a board you're mid-drag on.
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('offers the full sha on hover', () => {
    render(<Footer />)

    expect(screen.getByRole('link')).toHaveAttribute('title', `Commit ${TEST_SHA}`)
  })
})
