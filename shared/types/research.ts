/** The research loop's page (/research): what the status service's GET /api/research returns, and what the page sends back. */

export type QuestionKind = 'decision' | 'question' | 'canon' | 'calibration'

export interface ResearchAnswer {
  text: string
  at: string
  delivered_at: string | null
}

/** A question from the loop's questions.json, with Ricardo's answer once he gave one (kept by the status service). */
export interface ResearchQuestion {
  id: string
  experiment: string | null
  kind: QuestionKind
  title: string
  context: string
  options: string[]
  recommendation: string | null
  blocks: string | null
  status: string | null
  answer: ResearchAnswer | null
}

export interface PlanMeta {
  validFrom: string | null
  validUntil: string | null
  budgetPoints: number | null
}

export interface PlanDecision {
  status: 'approved' | 'rejected'
  at: string
  comment: string | null
  validFrom: string | null
  validUntil: string | null
  budgetPoints: number | null
  /** False when the plan changed after the decision: it needs a new one. */
  current: boolean
}

/** A run plan in loops/research/plans/: no experiment runs without an approved one. */
export interface ResearchPlan {
  file: string
  title: string
  sha256: string
  content: string
  meta: PlanMeta
  decision: PlanDecision | null
}

export interface ResearchUsage {
  session: number
  weekly: Array<{ label: string, percent: number }>
}

export interface ResearchLoop {
  name: string
  session: number | null
  paused: boolean
  pausedReason: string | null
  lastTick: { at: string, result: string, reason: string | null } | null
  usage: ResearchUsage | null
  fenceOk: boolean
  fenceIssue: string | null
}

export interface ResearchWorker {
  session: number
  experiment: string
  startedAt: string
  heartbeatFile?: string
}

/** The loop's own state.json (phase, last tick, current plan, worker, ...); only the fields the page shows are typed. */
export interface ResearchState {
  phase?: string
  lastTickAt?: string | null
  currentPlan?: string | null
  worker?: ResearchWorker | null
  currentExperiments?: string[]
  [key: string]: unknown
}

export interface ResearchView {
  loop: ResearchLoop
  state: ResearchState
  heartbeat: { file: string, at: string, ageMinutes: number } | null
  questions: ResearchQuestion[]
  plans: ResearchPlan[]
}

export interface ResearchResponse {
  available: boolean
  error?: string
  view: ResearchView | null
}
