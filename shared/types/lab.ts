/** The lab loop (pds-backlog/loops/lab), as the `/lab` page shows it. */

export type ExperimentStatus = 'in-lab-main' | 'needs-merge' | 'liked' | 'rejected' | 'outside-lab-main'

/** feature, ai-dx (helps agents and developers), gap (closes a gap with a competitor), challenge (becomes a proposal). */
export type IdeaKind = 'feature' | 'ai-dx' | 'gap' | 'challenge'

export interface LabExperiment {
  id: string
  name: string
  repo: string
  kind?: IdeaKind
  branch: string
  /** null for experiments without a page to show (e.g. an agent guide, a proposal). */
  app: string | null
  previewPath: string | null
  description: string
  pr: number
  prUrl: string
  status: ExperimentStatus
  origin: string
  createdAt: string
  note?: string
  /** Merged into lab/main (decided by the server from the status). */
  inLabMain: boolean
  /** On the product owner's `lab/main` dev server; null when the experiment is not in `lab/main`. */
  previewUrl: string | null
}

export interface LabIdea {
  id: string
  title: string
  kind?: IdeaKind
  repo: string
  area?: string
  description: string
  why?: string
  value: number
  effort?: string
  status: 'ready' | 'next' | 'doing' | 'done' | 'parked' | 'rejected' | 'dropped'
  /** Ricardo's own rating (from the dashboard, applied by the PO); counts instead of `value` when set. */
  ricardoValue?: number
  notes?: Array<{ at: string, text: string }>
  dependsOn?: string[]
  note?: string
  source?: string
  addedAt?: string
}

/** A written proposal (loops/lab/proposals/<id>.md) for an idea that questions a fundamental choice. */
export interface LabProposal {
  id: string
  title: string
  status: 'draft' | 'accepted' | 'rejected' | string
  /** The first paragraph of its Recommendation section. */
  recommendation: string
  url: string
}

export interface LabTick {
  at: string
  result: 'sent' | 'skipped' | 'error'
  reason?: string
  message?: string
}

export interface LabRun {
  at: string
  kind: string
  idea?: string
  branch?: string
  pr?: number
  result: string
  note?: string
}

export interface LabOverview {
  available: boolean
  /** Why the loop could not be read, when `available` is false. */
  error?: string
  session: number
  /** loop.json minStarsToBuild: ideas below it are parked, never built. */
  minStarsToBuild: number
  intervalMinutes: number
  worker: { idea?: string, repo?: string, branch?: string, startedAt?: string } | null
  research: { startedAt?: string } | null
  pinnedAt: string | null
  lastResearchAt: string | null
  experiments: LabExperiment[]
  ideas: LabIdea[]
  proposals: LabProposal[]
  ticks: LabTick[]
  runs: LabRun[]
  /** The `lab/main` dev servers, one per app. */
  previews: Array<{ app: string, url: string }>
}

/** Ricardo's feedback on an idea (status service /api/inbox/feedback), until and shortly after the PO applied it. */
export interface LabFeedback {
  id: number
  loop: string
  target_type: 'idea' | 'experiment'
  target_id: string
  kind: 'rating' | 'not-now' | 'reject' | 'note' | 'like'
  value: number | null
  text: string
  status: 'pending' | 'delivered' | 'applied'
  created: string
  updated: string
  applied_note: string | null
}

/** The loop's state, decided by the status service (lss-tools inbox.loop_view, the loop state machine). */
export interface LabLoopView {
  name: string
  status: 'running' | 'paused'
  reason: 'ricardo' | 'pr-limit' | null
  since: string
  display: 'broken' | 'paused' | 'held' | 'working' | 'waiting'
  detail: string
  /** What Ricardo can do now: "pause" or "resume". */
  events: string[]
  lastTickAt: string | null
  timerRanAt: string | null
  nextTickAt: string | null
  history: Array<{ at: string, event: string, from_state: string, to_state: string, actor: string | null, note: string | null }>
}
