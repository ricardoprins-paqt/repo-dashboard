/** `POST /api/research/fence-accept`: Ricardo accepts a changed FENCE.md, so the research loop can run again. */
export default defineEventHandler(async (event): Promise<unknown> => {
  assertLocalAction(event)
  return await $fetch<unknown>(`${inboxApi()}/api/research/fence-accept`, { method: 'POST', body: {}, headers: { 'X-LSS-Action': '1' }, timeout: 30000 })
})
