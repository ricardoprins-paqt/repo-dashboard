/**
 * `POST /api/lab-feedback` `{ idea, kind: 'rating' | 'not-now' | 'reject' | 'note', value?, text? }`: Ricardo's feedback on a
 * lab backlog idea. Stored by the status service and applied by the lab PO (the dashboard never edits the backlog itself).
 */
export default defineEventHandler(async (event) => {
  assertLocalAction(event)
  const body = await readBody<{ idea?: string, kind?: string, value?: number, text?: string }>(event)
  return await $fetch(`${inboxApi()}/api/inbox/feedback`, {
    method: 'POST', headers: { 'X-LSS-Action': '1' }, timeout: 10000,
    body: { loop: 'lab', target_type: 'idea', target_id: String(body.idea ?? ''), kind: body.kind, value: body.value, text: body.text ?? '' },
  }).catch((e) => {
    throw createError({ statusCode: 400, statusMessage: e.data?.error ?? (e as Error).message })
  })
})
