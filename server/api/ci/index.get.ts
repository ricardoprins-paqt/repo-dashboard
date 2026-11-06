import type { CiOverview } from '#shared/types/ci'
import { buildRows, STRIP_LENGTH } from '../../lib/ci.ts'
import { ciStore } from '../../lib/ci-store.ts'
import { ciOrg, syncState } from '../../lib/ci-sync.ts'

/** `GET /api/ci`: the CI page, from the local history only (the hourly sync is what calls GitHub). */
export default defineEventHandler((): CiOverview => {
  const store = ciStore()
  const repos = store.repos()
  const active = new Set(repos.filter(repo => repo.access === 'ok').map(repo => repo.name))
  return {
    org: ciOrg(),
    sync: syncState(store),
    rows: buildRows(store.recentRuns(Math.max(STRIP_LENGTH, 20)).filter(run => active.has(run.repo))),
    noAccess: repos.filter(repo => repo.access === 'none').map(({ pushedAt: _p, hasRuns: _h, ...repo }) => repo),
    explained: store.explainedRunIds(),
  }
})
