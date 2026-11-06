import type { CiFailureKind, CiRun, CiWorkflowRow } from '#shared/types/ci'

export type CiFilter = 'all' | 'red' | 'running' | 'green'

/** "45 s", "3 min 20 s", "1 h 5 min". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '–'
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 && minutes < 10 ? `${minutes} min ${seconds % 60} s` : `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** How long ago, without "ago": "12 days", "5 hours", "20 minutes". */
export function elapsed(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  const units: Array<[string, number]> = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]]
  for (const [unit, size] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size)
      return `${count} ${unit}${count === 1 ? '' : 's'}`
    }
  }
  return 'less than a minute'
}

/** The change in average duration against the window before, when it is big enough to mention (10 % or more). */
export function durationTrend(row: Pick<CiWorkflowRow, 'avgDurationS' | 'previousAvgDurationS'>): { label: string, slower: boolean } | null {
  const { avgDurationS: now, previousAvgDurationS: before } = row
  if (!now || !before) return null
  const change = (now - before) / before
  if (Math.abs(change) < 0.1) return { label: 'about as fast as the 10 runs before', slower: false }
  return { label: `${Math.round(Math.abs(change) * 100)}% ${change > 0 ? 'slower' : 'faster'} than the 10 runs before`, slower: change > 0 }
}

export function matchesCiFilter(row: CiWorkflowRow, filter: CiFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'red': return row.state === 'failure'
    case 'running': return row.running
    case 'green': return row.state === 'success'
  }
}

export function filterCiRows(rows: CiWorkflowRow[], filter: CiFilter, search: string): CiWorkflowRow[] {
  const needle = search.trim().toLowerCase()
  return rows.filter(row => matchesCiFilter(row, filter)
    && (!needle || row.repo.toLowerCase().includes(needle) || row.workflow.toLowerCase().includes(needle)))
}

export function summarizeCi(rows: CiWorkflowRow[]) {
  return {
    workflows: rows.length,
    repos: new Set(rows.map(row => row.repo)).size,
    red: rows.filter(row => row.state === 'failure').length,
    running: rows.filter(row => row.running).length,
    green: rows.filter(row => row.state === 'success').length,
  }
}

/** One run in words, for tooltips and screen readers. */
export function describeRun(run: CiRun): string {
  const result = run.state === 'pending' ? run.status.replace('_', ' ') : (run.conclusion ?? run.status).replace('_', ' ')
  const when = new Date(run.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `${result} · ${when} · ${run.sha.slice(0, 7)} ${run.title}${run.durationS !== null ? ` · ${formatDuration(run.durationS)}` : ''}`
}

export const runStateClass: Record<CiRun['state'], string> = {
  success: 'bg-success',
  failure: 'bg-danger',
  pending: 'bg-warning',
  none: 'bg-neutral-muted',
}

export const failureKindLabel: Record<CiFailureKind, string> = {
  'code': 'Code change',
  'flaky': 'Flaky test',
  'ci-setup': 'CI setup or runner',
  'base-red': 'Already red before',
  'unknown': 'Unclear',
}
