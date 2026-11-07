import type { ResearchResponse, ResearchView } from '#shared/types/research'

/** `GET /api/research`: the research loop's page data (state, questions, run plans), from the status service. */
export default defineEventHandler(async (): Promise<ResearchResponse> => {
  try {
    const view = await $fetch<ResearchView>(`${inboxApi()}/api/research`, { timeout: 15000 })
    return { available: true, view }
  }
  catch (e) {
    return { available: false, error: `The status service does not answer (${(e as Error).message})`, view: null }
  }
})
