/**
 * One MSW server for the whole agent test suite.
 *
 * `onUnhandledRequest: 'error'` is the important line. Any HTTP call this suite
 * hasn't explicitly faked fails the test instead of quietly going out to the
 * real internet. That's what makes "these tests never hit Zapier" a fact the CI
 * enforces, rather than a promise in a README.
 */
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

export const server = setupServer()

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
