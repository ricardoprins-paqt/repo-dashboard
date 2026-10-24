/**
 * `POST /api/inbox` with `{ action, ... }`:
 * - `answer` `{ id, answer }`: answer an item; the dispatcher delivers it to a session
 * - `close` `{ id, note? }`: mark an item done (also "Got it" on an FYI)
 * - `snooze` `{ id, until }`: hide an item until a time
 * - `task-close` `{ id, status: 'done' | 'dropped', note? }`
 * - `pin` `{ session, pinned }`: a pinned session is never used to resume a task
 * - `check`: close items whose PRs/branches are gone, now (instead of at the next 5-minute check)
 * - `loop-tick` `{ loop }`: a tick for a loop now (`paqt-loop tick <loop> --force`, guardrails still apply)
 * - `loop-research` `{ loop }`: ask a loop's session to start research now
 * The last three answer `{ ok, output }`: the tool's last line, to show on the page.
 */
export default defineEventHandler(async (event) => {
  assertLocalAction(event)
  const body = await readBody<Record<string, unknown>>(event)
  // A tick or a check runs gh and claude -p first, so those get more time.
  const post = (path: string, payload: Record<string, unknown>, timeout = 15000) =>
    $fetch(`${inboxApi()}${path}`, { method: 'POST', body: payload, headers: { 'X-LSS-Action': '1' }, timeout })
  const id = Number(body.id)
  switch (body.action) {
    case 'answer':
      if (!String(body.answer ?? '').trim()) throw createError({ statusCode: 400, statusMessage: 'Empty answer' })
      return await post('/api/inbox/answer', { id, answer: String(body.answer).trim() })
    case 'close':
      return await post('/api/inbox/item', { id, status: 'done', note: body.note ? String(body.note) : 'closed by Ricardo' })
    case 'snooze':
      return await post('/api/inbox/item', { id, status: 'snoozed', snooze_until: String(body.until) })
    case 'task-close':
      return await post('/api/inbox/task', { id, status: body.status === 'dropped' ? 'dropped' : 'done', closed_note: body.note ? String(body.note) : 'closed by Ricardo' })
    case 'check':
      return await post('/api/inbox/check', {}, 180000)
    case 'loop-tick':
    case 'loop-research':
      if (!/^[a-z0-9-]+$/.test(String(body.loop))) throw createError({ statusCode: 400, statusMessage: 'Bad loop name' })
      return await post(`/api/inbox/${body.action}`, { loop: String(body.loop) }, 180000)
    case 'pin':
      return await post('/api/inbox/pin', { session: Number(body.session), pinned: Boolean(body.pinned) })
    default:
      throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
  }
})
