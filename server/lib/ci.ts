import type { CiFailingSince, CiRun, CiWorkflowRow } from '#shared/types/ci'
import { runState } from './github.ts'

/** The fields of a run from `GET /repos/{owner}/{repo}/actions/runs` that the CI page uses. */
export interface RawActionsRun {
  id: number
  name: string | null
  path: string
  workflow_id: number
  head_branch: string | null
  head_sha: string
  event: string
  status: string | null
  conclusion: string | null
  run_attempt?: number
  created_at: string
  run_started_at?: string | null
  updated_at: string
  html_url: string
  actor?: { login: string } | null
  head_commit?: { message?: string | null, author?: { name?: string | null } | null } | null
}

/**
 * The runs that say something about the default branch's CI. Pull request runs test a merge into another branch, and Dependabot's
 * update jobs (one "workflow run" per package update) are not CI.
 */
export const isCiRun = (run: Pick<RawActionsRun, 'event' | 'path'>) => !run.event.startsWith('pull_request') && !run.path.startsWith('dynamic/dependabot/')

/** A run's `updated_at` moves when it is re-run or its logs expire, so longer than a day is not a real duration. */
const MAX_DURATION_S = 24 * 60 * 60

function duration(from: string, to: string): number | null {
  const seconds = Math.round((Date.parse(to) - Date.parse(from)) / 1000)
  return seconds >= 0 && seconds <= MAX_DURATION_S ? seconds : null
}

export function toCiRun(repo: string, raw: RawActionsRun): CiRun {
  const status = raw.status ?? 'queued'
  const startedAt = raw.run_started_at ?? raw.created_at
  const finished = status === 'completed'
  return {
    id: raw.id,
    repo,
    workflowId: raw.workflow_id,
    workflow: raw.name || raw.path.split('/').at(-1) || String(raw.workflow_id),
    path: raw.path.replace(/@.*$/, ''),
    branch: raw.head_branch ?? '',
    event: raw.event,
    status,
    conclusion: raw.conclusion,
    state: runState(status, raw.conclusion),
    sha: raw.head_sha,
    title: (raw.head_commit?.message ?? '').split('\n')[0]?.trim() ?? '',
    author: raw.head_commit?.author?.name || raw.actor?.login || 'unknown',
    attempt: raw.run_attempt ?? 1,
    createdAt: raw.created_at,
    startedAt,
    updatedAt: raw.updated_at,
    durationS: finished ? duration(startedAt, raw.updated_at) : null,
    url: raw.html_url,
  }
}

/** Newest first, by start time and then id (a re-run keeps its id but gets a new start). */
export const byNewest = (a: CiRun, b: CiRun) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id

const hasVerdict = (run: CiRun) => run.state === 'success' || run.state === 'failure'

/** The first failing run after the last green one, or null when the latest verdict is green. Expects newest first. */
export function failingSince(runs: CiRun[]): CiFailingSince | null {
  const verdicts = runs.filter(hasVerdict)
  if (verdicts[0]?.state !== 'failure') return null
  const green = verdicts.findIndex(run => run.state === 'success')
  const failing = green === -1 ? verdicts : verdicts.slice(0, green)
  return { run: failing.at(-1)!, count: failing.length, beforeHistory: green === -1 }
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

const TREND_WINDOW = 10
export const STRIP_LENGTH = 30

/** Average duration of the latest window of green runs and of the window before. Expects newest first. */
export function durationTrend(runs: CiRun[]): { avg: number | null, previous: number | null } {
  const finished = runs.filter(run => run.durationS !== null && hasVerdict(run))
  const green = finished.filter(run => run.state === 'success')
  const basis = (green.length ? green : finished).map(run => run.durationS!)
  return {
    avg: average(basis.slice(0, TREND_WINDOW)),
    previous: basis.length >= TREND_WINDOW * 2 ? average(basis.slice(TREND_WINDOW, TREND_WINDOW * 2)) : null,
  }
}

export function buildRow(runs: CiRun[]): CiWorkflowRow {
  const sorted = [...runs].sort(byNewest)
  const last = sorted[0]!
  const verdict = sorted.find(hasVerdict)
  const trend = durationTrend(sorted)
  return {
    repo: last.repo,
    workflowId: last.workflowId,
    workflow: last.workflow,
    path: last.path,
    state: verdict?.state ?? 'none',
    running: last.state === 'pending',
    last,
    failingSince: failingSince(sorted),
    recent: sorted.slice(0, STRIP_LENGTH),
    avgDurationS: trend.avg,
    previousAvgDurationS: trend.previous,
  }
}

const STATE_RANK = { failure: 0, pending: 1, none: 2, success: 3 } as const

/** Red first (the longest red at the top), then running, then the rest by repo and workflow. */
export function sortRows(rows: CiWorkflowRow[]): CiWorkflowRow[] {
  const rank = (row: CiWorkflowRow) => (row.state === 'failure' ? 0 : row.running ? 1 : STATE_RANK[row.state] + 1)
  return [...rows].sort((a, b) => rank(a) - rank(b)
    || (a.failingSince && b.failingSince ? a.failingSince.run.createdAt.localeCompare(b.failingSince.run.createdAt) : 0)
    || a.repo.localeCompare(b.repo)
    || a.workflow.localeCompare(b.workflow))
}

/** Groups runs into one row per repo × workflow. */
export function buildRows(runs: CiRun[]): CiWorkflowRow[] {
  const groups = new Map<string, CiRun[]>()
  for (const run of runs) {
    const key = `${run.repo}\u0000${run.workflowId}`
    const group = groups.get(key)
    if (group) group.push(run)
    else groups.set(key, [run])
  }
  return sortRows([...groups.values()].map(buildRow))
}
