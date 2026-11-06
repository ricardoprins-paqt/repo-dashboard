import type { CiRepoDetail } from '#shared/types/ci'
import { buildRows } from '../../../lib/ci.ts'
import { ciStore } from '../../../lib/ci-store.ts'

/** `GET /api/ci/repos/<name>`: one repo's recent default-branch runs. */
export default defineEventHandler((event): CiRepoDetail => {
  const store = ciStore()
  const repo = store.repo(getRouterParam(event, 'name') ?? '')
  if (!repo) throw createError({ statusCode: 404, statusMessage: 'This repository has no CI history here' })
  const runs = store.runsOf(repo.name, 100)
  const { pushedAt: _p, hasRuns: _h, ...info } = repo
  return { repo: info, runs, rows: buildRows(store.recentRuns(30, repo.name)), explained: store.explainedRunIds() }
})
