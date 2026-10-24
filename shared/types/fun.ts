/** The fun loop (pds-backlog/loops/fun), as the `/fun` page shows it. */

export type ExperimentStatus = 'in-fun-main' | 'needs-merge' | 'liked' | 'rejected' | 'outside-fun-main'

export interface FunExperiment {
  id: string
  name: string
  repo: string
  branch: string
  app: string
  previewPath: string
  description: string
  pr: number
  prUrl: string
  status: ExperimentStatus
  origin: string
  createdAt: string
  note?: string
  /** On the product owner's `fun/main` dev server; null when the experiment is not in `fun/main`. */
  previewUrl: string | null
}

export interface FunIdea {
  id: string
  title: string
  repo: string
  area?: string
  description: string
  why?: string
  value: number
  effort?: string
  status: 'ready' | 'next' | 'doing' | 'done' | 'dropped'
  source?: string
  addedAt?: string
}

export interface FunTick {
  at: string
  result: 'sent' | 'skipped' | 'error'
  reason?: string
  message?: string
}

export interface FunRun {
  at: string
  kind: string
  idea?: string
  branch?: string
  pr?: number
  result: string
  note?: string
}

export interface FunOverview {
  available: boolean
  /** Why the loop could not be read, when `available` is false. */
  error?: string
  session: number
  intervalMinutes: number
  paused: boolean
  worker: { idea?: string, repo?: string, branch?: string, startedAt?: string } | null
  research: { startedAt?: string } | null
  lastTickAt: string | null
  nextTickAt: string | null
  pinnedAt: string | null
  lastResearchAt: string | null
  experiments: FunExperiment[]
  ideas: FunIdea[]
  ticks: FunTick[]
  runs: FunRun[]
  /** The `fun/main` dev servers, one per app. */
  previews: Array<{ app: string, url: string }>
}
