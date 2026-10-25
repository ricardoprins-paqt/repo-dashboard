import type { InboxAttachment } from '#shared/types/inbox'

/** `GET /api/inbox-attachment/<id>`: one attachment with its content, from the status service. */
export default defineEventHandler(async (event): Promise<InboxAttachment> => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id < 1) throw createError({ statusCode: 400, statusMessage: 'Bad attachment id' })
  return await $fetch<InboxAttachment>(`${inboxApi()}/api/inbox/attachment/${id}`, { timeout: 10000 }).catch(() => {
    throw createError({ statusCode: 404, statusMessage: 'No such attachment' })
  })
})
