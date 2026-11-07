/** `GET /api/research/approvals.json`: the run plan approvals that the research loop and its harnesses check before any run. */
export default defineEventHandler(async (): Promise<unknown> => {
  return await $fetch<unknown>(`${inboxApi()}/api/research/approvals.json`, { timeout: 15000 })
})
