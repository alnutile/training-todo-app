/**
 * Runs before every web test file.
 *
 * Two jobs: start the fake network, and make sure a component test can't open a
 * websocket to a real Supabase project.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './mocks/server'

// supabase-js opens a Realtime websocket as soon as you subscribe to a channel.
// jsdom would try to dial it for real, so we swap in a socket that does nothing.
// Realtime *logic* is tested directly in src/lib/board.test.ts instead.
class SilentWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  readonly readyState = SilentWebSocket.CONNECTING
  constructor(readonly url: string) {}
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}
vi.stubGlobal('WebSocket', SilentWebSocket)

beforeAll(() => {
  // Any request the tests haven't faked is a failure, not a silent trip to the
  // real internet.
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  // Optional chaining: whether a stored session survives between tests depends
  // on the JS runtime providing localStorage, and we don't want to depend on it.
  globalThis.localStorage?.clear?.()
})

afterAll(() => {
  server.close()
})
