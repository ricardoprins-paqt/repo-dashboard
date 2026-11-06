import { ciStore } from '../../lib/ci-store.ts'
import { syncNow, syncState } from '../../lib/ci-sync.ts'

/** `POST /api/ci`: "Refresh now". Starts a sync (or joins the running one) and returns at once; the page polls `GET /api/ci`. */
export default defineEventHandler((event) => {
  assertLocalAction(event)
  void syncNow()
  return syncState(ciStore())
})
