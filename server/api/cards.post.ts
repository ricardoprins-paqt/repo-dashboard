/**
 * `POST /api/cards` with `{ action, ... }`, Ricardo's own changes to his focus cards (no session or tool calls this):
 * - `create` `{ title, note?, links?, status? }`, `update` `{ id, title?, note?, links?, status? }`, `delete` `{ id }` (its items
 *   are unlinked, nothing is lost), `reorder` `{ ids }`.
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  assertLocalAction(event)
  const body = await readBody<Record<string, unknown>>(event)
  const action = String(body.action ?? '')
  if (!['create', 'update', 'delete', 'reorder'].includes(action)) throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
  if (action === 'create' && !String(body.title ?? '').trim()) throw createError({ statusCode: 400, statusMessage: 'A card needs a title' })
  if (body.status !== undefined && body.status !== 'focused' && body.status !== 'parked') throw createError({ statusCode: 400, statusMessage: 'Bad status' })
  return await $fetch<unknown>(`${inboxApi()}/api/cards`, { method: 'POST', body, headers: { 'X-LSS-Action': '1' }, timeout: 15000 })
})
