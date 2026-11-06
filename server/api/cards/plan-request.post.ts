/** `POST /api/cards/plan-request` `{ id }`: ask the personal assistant (session 3) for a plan for this card. */
export default defineEventHandler(async (event): Promise<unknown> => {
  assertLocalAction(event)
  const { id } = await readBody<{ id: unknown }>(event)
  if (!Number(id)) throw createError({ statusCode: 400, statusMessage: 'Which card?' })
  return await $fetch<unknown>(`${inboxApi()}/api/cards/plan-request`, { method: 'POST', body: { id: Number(id) }, headers: { 'X-LSS-Action': '1' }, timeout: 15000 })
})
