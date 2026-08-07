import { setupServer } from 'msw/node'

/** One mock network for the web test suite; handlers are added per test. */
export const server = setupServer()
