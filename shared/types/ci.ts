import type { CheckState } from './repo'

/** One GitHub Actions run on a repo's default branch, as stored by the CI sync. */
export interface CiRun {
  id: number
  repo: string
  workflowId: number
  workflow: string
  /** `.github/workflows/ci.yml`, or `dynamic/...` for GitHub's own workflows (Dependabot, CodeQL). */
  path: string
  branch: string
  event: string
  status: string
  conclusion: string | null
  /** success, failure, pending (queued or running) or none (cancelled, skipped, neutral). */
  state: CheckState
  sha: string
  /** First line of the commit message. */
  title: string
  author: string
  attempt: number
  createdAt: string
  startedAt: string
  updatedAt: string
  /** Seconds from start to the last update; null while it runs. */
  durationS: number | null
  url: string
}

export interface CiFailingSince {
  /** The first failing run after the last green one. */
  run: CiRun
  /** Failing runs since then, the latest included. */
  count: number
  /** No green run in the stored history: it has been red for at least this long. */
  beforeHistory: boolean
}

/** One repo × workflow on the default branch. */
export interface CiWorkflowRow {
  repo: string
  workflowId: number
  workflow: string
  path: string
  /** The latest finished run with a verdict (success or failure); `none` when there is none. */
  state: CheckState
  running: boolean
  last: CiRun
  failingSince: CiFailingSince | null
  /** The last runs, newest first (at most 30). */
  recent: CiRun[]
  /** Average duration of the last 10 green runs (all finished runs if there are no green ones). */
  avgDurationS: number | null
  /** The same average for the 10 before, to show the trend; null without enough history. */
  previousAvgDurationS: number | null
}

export interface CiRepoInfo {
  name: string
  defaultBranch: string
  url: string
  access: 'ok' | 'none'
  /** Why the repo cannot be read (SSO, permissions). */
  error: string | null
  checkedAt: string | null
}

export interface CiSyncState {
  running: boolean
  lastSyncedAt: string | null
  nextSyncAt: string | null
  lastError: string | null
  /** Progress while running: repos done / total. */
  done: number
  total: number
}

export interface CiOverview {
  org: string
  sync: CiSyncState
  rows: CiWorkflowRow[]
  /** Repos that could not be read, by name. */
  noAccess: CiRepoInfo[]
  /** Explanations already made, so the page can show "Show explanation" instead of asking again. */
  explained: number[]
}

export interface CiRepoDetail {
  repo: CiRepoInfo
  runs: CiRun[]
  rows: CiWorkflowRow[]
  explained: number[]
}

export type CiFailureKind = 'code' | 'flaky' | 'ci-setup' | 'base-red' | 'unknown'

/** The AI explanation of a failed run. */
export interface CiExplanation {
  runId: number
  createdAt: string
  model: string
  /** What failed: job, step, test or command. */
  failed: string
  cause: string
  kind: CiFailureKind
  fix: string
  confidence: 'high' | 'medium' | 'low'
  confidenceReason: string
  /** The failing jobs and steps the explanation looked at. */
  steps: string[]
  /** The model's answer as text when it was not the expected JSON. */
  raw?: string
}
