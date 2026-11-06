/** `POST /api/focus/repos` `{ repos }`: Ricardo's repo setting for the focus page. */
export default defineEventHandler(async (event): Promise<unknown> => {
  assertLocalAction(event)
  const { repos } = await readBody<{ repos: unknown }>(event)
  const list = Array.isArray(repos) ? repos.map(r => String(r).trim()).filter(Boolean) : null
  if (!list || list.some(r => !/^[\w.-]+\/(?:[\w.-]+|\*)$/.test(r))) throw createError({ statusCode: 400, statusMessage: 'Repos are "org/repo" or "org/*"' })
  resetFocusPrs()
  return await $fetch<unknown>(`${inboxApi()}/api/focus/repos`, { method: 'POST', body: { repos: list }, headers: { 'X-LSS-Action': '1' }, timeout: 15000 })
})
