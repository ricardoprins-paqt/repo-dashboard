import type { RepoOverview } from '../../shared/types/repo.ts'
import { collectOverview } from './collect.ts'

interface Entry {
  value: RepoOverview
  storedAt: number
}

const TTL_MS = { local: 5_000, github: 60_000 } as const

const cache = new Map<string, Entry>()
const inFlight = new Map<string, Promise<RepoOverview>>()

export interface OverviewRequest {
  github: boolean
  /** Bypass the cache and recompute. */
  refresh?: boolean
  /** Also `git fetch --all --prune` every repo. Always bypasses the cache. */
  fetch?: boolean
}

/**
 * Returns the overview, reusing a recent result when possible. Concurrent
 * requests for the same data share one collection run, so several browser
 * tabs cannot multiply the git and GitHub calls.
 */
export async function getOverview(request: OverviewRequest): Promise<RepoOverview> {
  const key = request.github ? 'github' : 'local'
  const bypass = request.refresh === true || request.fetch === true

  if (!bypass) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.storedAt < TTL_MS[key]) return hit.value
    // A fresh full overview also answers a local-only request.
    const full = cache.get('github')
    if (key === 'local' && full && Date.now() - full.storedAt < TTL_MS.github) return full.value
  }

  const running = inFlight.get(key)
  if (running && !request.fetch) return running

  const run = collectOverview({ github: request.github, fetch: request.fetch === true })
    .then((value) => {
      cache.set(key, { value, storedAt: Date.now() })
      // Fetching changes remote state, so the other cached view is out of date too.
      if (request.fetch) cache.delete(key === 'github' ? 'local' : 'github')
      return value
    })
    .finally(() => {
      if (inFlight.get(key) === run) inFlight.delete(key)
    })
  inFlight.set(key, run)
  return run
}
