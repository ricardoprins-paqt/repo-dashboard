import { syncDue, syncNow } from '../lib/ci-sync.ts'

/**
 * Keeps the CI page's history up to date: a sync shortly after start when the last one is an hour old, then every hour.
 * `REPO_DASHBOARD_CI_SYNC=0` turns it off (the e2e tests, which must not call GitHub).
 */
const CHECK_EVERY_MS = 5 * 60 * 1000

export default defineNitroPlugin(() => {
  if (process.env.REPO_DASHBOARD_CI_SYNC === '0' || import.meta.prerender) return
  const state = globalThis as { __ciSyncTimer?: ReturnType<typeof setInterval> }
  // A hot reload in dev loads the plugin again: keep one timer.
  if (state.__ciSyncTimer) clearInterval(state.__ciSyncTimer)
  const tick = () => {
    if (syncDue()) void syncNow()
  }
  setTimeout(tick, 15_000).unref()
  state.__ciSyncTimer = setInterval(tick, CHECK_EVERY_MS)
  state.__ciSyncTimer.unref()
})
