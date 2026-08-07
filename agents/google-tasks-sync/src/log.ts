import { writeSync } from 'node:fs'

/** Anything that takes a line of text. Tests pass a collector instead of stdout. */
export type Logger = (msg: string) => void

/**
 * Synchronous stdout write — unlike console.log (async to a pipe), this survives
 * an immediate hard kill (e.g. OOM SIGKILL), so progress logs aren't lost.
 */
export const stdoutLog: Logger = (msg) => {
  writeSync(1, msg + '\n')
}

/** Collects lines in memory. Used by tests to assert on what the agent said. */
export function createMemoryLog(): Logger & { lines: string[] } {
  const lines: string[] = []
  const log = ((msg: string) => {
    lines.push(msg)
  }) as Logger & { lines: string[] }
  log.lines = lines
  return log
}

export const rssMB = () => `${Math.round(process.memoryUsage().rss / 1048576)}MB`
