/**
 * `POST /api/lab-feedback` `{ idea | experiment, kind, value?, text? }`: Ricardo's feedback on a lab idea (rating, not-now,
 * reject) or experiment (like, reject). Stored by the status service and applied by the lab PO (the dashboard never edits the
 * loop's files itself).
 */
export default defineEventHandler(async (event) => {
  assertLocalAction(event)
  const body = await readBody<{ idea?: string, experiment?: string, kind?: string, value?: number, text?: string }>(event)
  const targetType = body.experiment ? 'experiment' : 'idea'
  return await $fetch(`${inboxApi()}/api/inbox/feedback`, {
    method: 'POST', headers: { 'X-LSS-Action': '1' }, timeout: 10000,
    body: { loop: 'lab', target_type: targetType, target_id: String(body.experiment ?? body.idea ?? ''), kind: body.kind, value: body.value, text: body.text ?? '' },
  }).catch((e) => {
    throw createError({ statusCode: 400, statusMessage: e.data?.error ?? (e as Error).message })
  })
})
