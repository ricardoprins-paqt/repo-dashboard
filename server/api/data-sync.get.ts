/**
 * `GET /api/data-sync`
 * The data sync state of library-comparison (its LC_DATA_SYNC commits and pushes data/jira.json and plans/), read from that app's
 * own `/api/data-sync`, so the dashboard can warn when its data did not reach git. `available: false` when library-comparison
 * does not run or is too old to report it; the dashboard then shows nothing.
 */
interface SyncStatus { enabled: boolean, problem: string | null, root: string, unpushed: number, pending: number }

export default defineEventHandler(async () => {
  const base = process.env.LC_URL || 'http://127.0.0.1:3100'
  const publicUrl = process.env.LC_PUBLIC_URL || 'http://library-comparison.localhost:8080'
  try {
    const status = await $fetch<SyncStatus>(`${base}/api/data-sync`, { timeout: 3000 })
    return { available: true, url: publicUrl, ...status }
  }
  catch {
    return { available: false, url: publicUrl }
  }
})
