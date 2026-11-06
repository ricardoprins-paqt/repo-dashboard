/** Ricardo's focus page (/focus): his own cards, the PRs waiting for him, and the daily FYI summaries. From the status service. */
import type { CardStatus } from './inbox'

export interface CardLink {
  label: string
  url: string
}

/** A card is Ricardo's: only he creates, edits, reorders or removes it. A session (the assistant) may only add a plan. */
export interface Card {
  id: number
  title: string
  note: string
  links: CardLink[]
  status: CardStatus
  position: number
  created: string
  updated: string
  /** The assistant's plan for this card (markdown): advice, the card stays his. */
  plan: string | null
  plan_requested_at: string | null
  plan_at: string | null
}

export interface CardsResponse {
  available: boolean
  error?: string
  cards: Card[]
}

export interface FocusReposResponse {
  available: boolean
  error?: string
  /** "org/repo" or "org/*". */
  repos: string[]
}

/** One FYI summary a day, written by the assistant; the FYI items it covers are closed. */
export interface Summary {
  id: number
  date: string
  content: string
  items: number[]
  created: string
}

export interface SummariesResponse {
  available: boolean
  error?: string
  summaries: Summary[]
}

export type PrChecks = 'success' | 'failure' | 'pending' | 'none'

/** An open, non-draft PR in one of Ricardo's repos that waits for a human. */
export interface FocusPr {
  repo: string
  number: number
  title: string
  url: string
  author: string
  created: string
  lane: 'fast' | 'careful' | null
  checks: PrChecks
  /** Why it is on the list: his review was requested, or a careful-lane PR without his approval. */
  reason: 'requested' | 'careful' | 'fast'
}

export interface FocusPrsResponse {
  available: boolean
  error?: string
  viewer: string | null
  /** Waiting for Ricardo's review: requested from him, or lane: careful without his approval. */
  review: FocusPr[]
  /** lane: fast without any human approval yet: anyone may approve, also Ricardo quickly. */
  quick: FocusPr[]
  fetchedAt: string
}
