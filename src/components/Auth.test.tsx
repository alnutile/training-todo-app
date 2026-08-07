/**
 * Component test for the login screen.
 *
 * The validation cases never reach the network at all — and because the mock
 * server is set to error on any un-faked request, "never reached the network"
 * is enforced, not assumed.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { fakeAuthApi } from '../test/mocks/supabase'
import { Auth } from './Auth'

describe('Auth', () => {
  it('rejects a malformed email before calling Supabase', async () => {
    const user = userEvent.setup()
    render(<Auth />)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'hunter2!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(/does not look like an email/i)).toBeInTheDocument()
  })

  it('rejects a too-short password before calling Supabase', async () => {
    const user = userEvent.setup()
    render(<Auth />)

    await user.type(screen.getByLabelText('Email'), 'you@example.com')
    await user.type(screen.getByLabelText('Password'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument()
  })

  it('signs in when the details are valid', async () => {
    server.use(...fakeAuthApi().handlers)
    const user = userEvent.setup()
    render(<Auth />)

    await user.type(screen.getByLabelText('Email'), 'you@example.com')
    await user.type(screen.getByLabelText('Password'), 'hunter2!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    // No complaint on screen means the request went out and came back happy.
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument()
  })

  it('surfaces the error Supabase sends back', async () => {
    server.use(...fakeAuthApi({ signInError: 'Invalid login credentials' }).handlers)
    const user = userEvent.setup()
    render(<Auth />)

    await user.type(screen.getByLabelText('Email'), 'you@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(/Invalid login credentials/)).toBeInTheDocument()
  })

  it('will not request a magic link without a valid email', async () => {
    const auth = fakeAuthApi()
    server.use(...auth.handlers)
    const user = userEvent.setup()
    render(<Auth />)

    await user.click(screen.getByRole('button', { name: /magic link/i }))

    expect(await screen.findByText(/enter your email/i)).toBeInTheDocument()
    expect(auth.magicLinkRequests).toHaveLength(0)
  })

  it('requests a magic link for a valid email', async () => {
    const auth = fakeAuthApi()
    server.use(...auth.handlers)
    const user = userEvent.setup()
    render(<Auth />)

    await user.type(screen.getByLabelText('Email'), 'you@example.com')
    await user.click(screen.getByRole('button', { name: /magic link/i }))

    expect(await screen.findByText(/Magic link sent to you@example.com/)).toBeInTheDocument()
    expect(auth.magicLinkRequests).toEqual([{ email: 'you@example.com' }])
  })

  it('switches to the create-account form', async () => {
    const user = userEvent.setup()
    render(<Auth />)

    await user.click(screen.getByRole('button', { name: 'Create one' }))

    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })
})
