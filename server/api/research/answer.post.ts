/** `POST /api/research/answer` `{ id, text, choice? }`: Ricardo's answer to one of the research loop's questions. */
export default defineEventHandler(async (event): Promise<unknown> => {
  assertLocalAction(event)
  const body = await readBody<{ id: unknown, text: unknown, choice?: unknown }>(event)
  const text = String(body.text ?? '').trim()
  if (!body.id || !text) throw createError({ statusCode: 400, statusMessage: 'An answer needs a question and some text' })
  return await $fetch<unknown>(`${inboxApi()}/api/research/answer`, {
    method: 'POST', body: { id: body.id, text, ...(body.choice !== undefined ? { choice: Number(body.choice) } : {}) }, headers: { 'X-LSS-Action': '1' }, timeout: 15000,
  })
})
