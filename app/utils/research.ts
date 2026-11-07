import type { ResearchPlan, ResearchQuestion, ResearchUsage } from '#shared/types/research'

/** The questions still waiting for Ricardo, in the loop's order (the page shows one at a time), and the answered ones. */
export function splitQuestions(questions: ResearchQuestion[]): { open: ResearchQuestion[], answered: ResearchQuestion[] } {
  return { open: questions.filter(q => !q.answer), answered: questions.filter(q => q.answer) }
}

/** Plans that need a decision (none yet, or the plan changed after it) first; decided ones after. */
export function groupPlans(plans: ResearchPlan[]): { waiting: ResearchPlan[], decided: ResearchPlan[] } {
  const needsDecision = (p: ResearchPlan) => !p.decision || !p.decision.current
  return { waiting: plans.filter(needsDecision), decided: plans.filter(p => !needsDecision(p)) }
}

export type HeartbeatState = 'none' | 'ok' | 'warn' | 'stalled'

/** A worker's heartbeat: quiet for 30 minutes is a warning, for 60 it counts as stalled (the loop then stops the run). */
export function heartbeatState(ageMinutes: number | null | undefined): HeartbeatState {
  if (ageMinutes == null) return 'none'
  if (ageMinutes >= 60) return 'stalled'
  if (ageMinutes >= 30) return 'warn'
  return 'ok'
}

/** The highest weekly usage (all models and model-scoped limits): the one the budget stop looks at. */
export function highestWeekly(usage: ResearchUsage | null | undefined): { label: string, percent: number } | null {
  const weekly = usage?.weekly ?? []
  if (!weekly.length) return null
  return weekly.reduce((a, b) => (b.percent > a.percent ? b : a))
}

/** The answer text the page sends: a chosen option, the loop's recommendation, and/or what Ricardo typed. */
export function answerText(q: Pick<ResearchQuestion, 'options' | 'recommendation'>, choice: number | null, typed: string): string {
  const picked = choice === -1 ? q.recommendation : choice != null ? q.options[choice] : null
  const text = typed.trim()
  if (picked && text) return `${picked}. ${text}`
  return picked ?? text
}
