/** `POST /api/research/plan` `{ file, decision: 'approve' | 'reject', comment? }`: Ricardo's decision on a run plan. */
export default defineEventHandler(async (event): Promise<unknown> => {
  assertLocalAction(event)
  const body = await readBody<{ file: unknown, decision: unknown, comment?: unknown }>(event)
  if (!body.file || (body.decision !== 'approve' && body.decision !== 'reject')) throw createError({ statusCode: 400, statusMessage: 'Which plan, and approve or reject?' })
  return await $fetch<unknown>(`${inboxApi()}/api/research/plan`, {
    method: 'POST', body: { file: String(body.file), decision: body.decision, comment: String(body.comment ?? '').trim() || null }, headers: { 'X-LSS-Action': '1' }, timeout: 15000,
  })
})
