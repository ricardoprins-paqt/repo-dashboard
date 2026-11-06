import type { FocusPrsResponse } from '#shared/types/focus'
import { fetchViewer } from '../../lib/github'
import { classifyPrs, searchPrs } from '../../lib/focus-prs'

/**
 * `GET /api/focus/prs` (`?fresh=1` skips the cache): open PRs that wait for Ricardo in the repos of his repo setting, in two lists
 * (waiting for his review; ready for a quick approval). Kept for a minute: GitHub searches are not free.
 */
export default defineEventHandler(async (event): Promise<FocusPrsResponse> => {
  const fresh = getQuery(event).fresh === '1'
  const cached = focusPrsCache()
  if (!fresh && cached && Date.now() - Date.parse(cached.fetchedAt) < 60_000) return cached
  try {
    const { repos } = await $fetch<{ repos: string[] }>(`${inboxApi()}/api/focus/repos`, { timeout: 15000 })
    const list = repos?.length ? repos : ['paqtdesign/*']
    const [viewer, raw] = await Promise.all([fetchViewer(), searchPrs(list)])
    const result: FocusPrsResponse = { available: true, viewer, ...classifyPrs(raw, viewer), fetchedAt: new Date().toISOString() }
    setFocusPrsCache(result)
    return result
  }
  catch (e) {
    return { available: false, error: (e as Error).message, viewer: null, review: [], quick: [], fetchedAt: new Date().toISOString() }
  }
})
