import type { SummariesResponse } from '#shared/types/focus'

/** `GET /api/summaries`: the daily FYI summaries the assistant writes, newest first. */
export default defineEventHandler(async (): Promise<SummariesResponse> => {
  try {
    const data = await $fetch<{ summaries: SummariesResponse['summaries'], requested_at?: string | null }>(`${inboxApi()}/api/summaries`, { timeout: 15000 })
    return { available: true, summaries: data.summaries ?? [], requested_at: data.requested_at ?? null }
  }
  catch (e) {
    return { available: false, error: `The status service does not answer (${(e as Error).message})`, summaries: [] }
  }
})
