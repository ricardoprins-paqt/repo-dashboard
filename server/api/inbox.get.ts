import type { InboxOverview } from '#shared/types/inbox'

/** `GET /api/inbox`: tasks, their inbox items and the live sessions, from the status service. */
export default defineEventHandler(async (): Promise<InboxOverview> => {
  try {
    const data = await $fetch<Omit<InboxOverview, 'available'>>(`${inboxApi()}/api/inbox`, { timeout: 15000 })
    return { available: true, ...data }
  }
  catch (e) {
    return { available: false, error: `The status service does not answer (${(e as Error).message})`, tasks: [], sessions: [], pins: [], reserved: [], generatedAt: new Date().toISOString() }
  }
})
