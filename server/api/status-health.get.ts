/**
 * `GET /api/status-health`: is the lss-tools status service (inbox, loops, sessions) up and well? Its own /api/health, or
 * `{ ok: false }` when it does not answer. The header shows a banner when it is not ok, so an outage is never silent.
 */
export default defineEventHandler(async () => {
  try {
    return await $fetch<{ ok: boolean, problems: string[] }>(`${inboxApi()}/api/health`, { timeout: 5000, ignoreResponseError: true })
  }
  catch (e) {
    return { ok: false, problems: [`the status service does not answer (${(e as Error).message})`] }
  }
})
