import type { LabLoopView } from '#shared/types/lab'

/** `GET /api/lab-loop`: the lab loop's state (running/paused, what it is doing, history), from the status service. */
export default defineEventHandler(async (): Promise<LabLoopView | null> => {
  try {
    return await $fetch<LabLoopView>(`${inboxApi()}/api/loops/lab`, { timeout: 10000 })
  }
  catch {
    return null
  }
})
