import { getOverview } from '../lib/cache.ts'

/** `POST /api/repos` runs `git fetch --all --prune` in every repository, then returns the fresh overview. */
export default defineEventHandler(async () => {
  return await getOverview({ github: true, fetch: true })
})
