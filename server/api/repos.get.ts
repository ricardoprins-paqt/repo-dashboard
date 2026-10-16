import { getOverview } from '../lib/cache.ts'

/**
 * `GET /api/repos?github=0|1&refresh=1`
 * `github=0` returns local git state only, which is fast enough to paint the page immediately.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  return await getOverview({
    github: query.github !== '0',
    refresh: query.refresh === '1',
  })
})
