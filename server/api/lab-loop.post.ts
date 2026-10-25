/**
 * `POST /api/lab-loop` `{ event: 'pause' | 'resume' }`: Ricardo pauses or resumes the lab loop. The loop state machine in the
 * status service decides whether that is possible now (e.g. resume only when paused).
 */
export default defineEventHandler(async (event) => {
  assertLocalAction(event)
  const body = await readBody<{ event?: string }>(event)
  if (body.event !== 'pause' && body.event !== 'resume') throw createError({ statusCode: 400, statusMessage: 'event must be pause or resume' })
  return await $fetch(`${inboxApi()}/api/loops/lab/event`, {
    method: 'POST', headers: { 'X-LSS-Action': '1' }, timeout: 10000,
    body: { event: body.event, actor: 'ricardo', reason: body.event === 'pause' ? 'ricardo' : null, note: 'dashboard' },
  }).catch((e) => {
    throw createError({ statusCode: 400, statusMessage: e.data?.error ?? (e as Error).message })
  })
})
