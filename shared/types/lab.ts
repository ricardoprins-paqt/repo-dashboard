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
  app: string
  previewPath: string
  description: string
  pr: number
  prUrl: string
  status: ExperimentStatus
  origin: string
  createdAt: string
  note?: string
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
  status: 'ready' | 'next' | 'doing' | 'done' | 'dropped'
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
  intervalMinutes: number
  paused: boolean
  worker: { idea?: string, repo?: string, branch?: string, startedAt?: string } | null
  research: { startedAt?: string } | null
  lastTickAt: string | null
  /** When `paqt-loop tick` last ran at all (every 5 minutes while the timer works). */
  timerRanAt: string | null
  nextTickAt: string | null
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
