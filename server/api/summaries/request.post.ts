/** `POST /api/summaries/request`: ask the personal assistant (session 3) to write the FYI summary now. */
export default defineEventHandler(async (event): Promise<unknown> => {
  assertLocalAction(event)
  return await $fetch<unknown>(`${inboxApi()}/api/summaries/request`, { method: 'POST', body: {}, headers: { 'X-LSS-Action': '1' }, timeout: 15000 })
})
