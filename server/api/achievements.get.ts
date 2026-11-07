import type { AchievementsResponse } from '#shared/types/focus'

/** `GET /api/achievements`: what we achieved per day (the assistant writes it at 18:00 and adds to it at midnight), newest first. */
export default defineEventHandler(async (): Promise<AchievementsResponse> => {
  try {
    const data = await $fetch<{ achievements: AchievementsResponse['achievements'] }>(`${inboxApi()}/api/achievements`, { timeout: 15000 })
    return { available: true, achievements: data.achievements ?? [] }
  }
  catch (e) {
    return { available: false, error: `The status service does not answer (${(e as Error).message})`, achievements: [] }
  }
})
