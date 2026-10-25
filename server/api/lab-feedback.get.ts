import type { LabFeedback } from '#shared/types/lab'

/** `GET /api/lab-feedback`: Ricardo's feedback on the lab backlog that is pending, being applied or applied recently. */
export default defineEventHandler(async (): Promise<LabFeedback[]> => {
  try {
    return await $fetch<LabFeedback[]>(`${inboxApi()}/api/inbox/feedback?loop=lab`, { timeout: 10000 })
  }
  catch {
    return []
  }
})
