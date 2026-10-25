import type { LabReview } from '#shared/types/lab'

/** `GET /api/lab-reviews`: the AI review rounds of liked lab experiments (the status service's review state machine). */
export default defineEventHandler(async (): Promise<LabReview[]> => {
  try {
    return await $fetch<LabReview[]>(`${inboxApi()}/api/reviews?loop=lab`, { timeout: 10000 })
  }
  catch {
    return []
  }
})
