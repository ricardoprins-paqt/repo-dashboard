import type { FocusReposResponse } from '#shared/types/focus'

/** `GET /api/focus/repos`: the repos whose PRs show on the focus page ("org/repo" or "org/*"). */
export default defineEventHandler(async (): Promise<FocusReposResponse> => {
  try {
    const data = await $fetch<{ repos: string[] }>(`${inboxApi()}/api/focus/repos`, { timeout: 15000 })
    return { available: true, repos: data.repos ?? [] }
  }
  catch (e) {
    return { available: false, error: `The status service does not answer (${(e as Error).message})`, repos: [] }
  }
})
