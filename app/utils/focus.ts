import type { Card, FocusPr } from '#shared/types/focus'
import type { CardStatus, InboxCardRef, InboxItem } from '#shared/types/inbox'
import type { InboxEntry } from './inbox'

/** FYIs are not inbox items any more: the assistant puts them in one daily summary. A critical one (something broken) still shows. */
export const hiddenAsFyi = (item: Pick<InboxItem, 'kind' | 'severity'>) => item.kind === 'fyi' && item.severity !== 'critical'

/**
 * The inbox's default view: the items of focused cards and every critical item. The rest (items of parked cards and items on
 * no card) goes in a folded "Not now" section; nothing is closed or lost. FYIs are left out of both (see hiddenAsFyi).
 */
export function splitByFocus(entries: InboxEntry[], cards: Array<Pick<InboxCardRef, 'id' | 'status'>>): { now: InboxEntry[], notNow: InboxEntry[] } {
  const status = new Map<number, CardStatus>(cards.map(c => [c.id, c.status]))
  const now: InboxEntry[] = []
  const notNow: InboxEntry[] = []
  for (const e of entries) {
    if (hiddenAsFyi(e.item)) continue
    const focused = e.item.card_id != null && status.get(e.item.card_id) === 'focused'
    if (focused || e.item.severity === 'critical') now.push(e)
    else notNow.push(e)
  }
  return { now, notNow }
}

const trim = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase()

/** Does this PR belong to the card? When a link is the PR itself, or its repository (URL or "org/repo"). */
export function prOnCard(pr: Pick<FocusPr, 'url' | 'repo'>, card: Pick<Card, 'links'>): boolean {
  const prUrl = trim(pr.url)
  const repo = pr.repo.toLowerCase()
  return card.links.some((l) => {
    for (const value of [l.url, l.label]) {
      if (!value) continue
      const v = trim(value)
      if (v === prUrl || v === repo || v === `https://github.com/${repo}`) return true
    }
    return false
  })
}

/** The PRs per card, and those on no card. A PR can be on more than one card. */
export function prsByCard(prs: FocusPr[], cards: Card[]): { byCard: Map<number, FocusPr[]>, loose: FocusPr[] } {
  const byCard = new Map<number, FocusPr[]>()
  const loose: FocusPr[] = []
  for (const pr of prs) {
    const on = cards.filter(c => prOnCard(pr, c))
    if (!on.length) loose.push(pr)
    for (const c of on) byCard.set(c.id, [...(byCard.get(c.id) ?? []), pr])
  }
  return { byCard, loose }
}

/** A plan is being made when it was asked for after the last plan came in. */
export const planPending = (card: Pick<Card, 'plan_requested_at' | 'plan_at'>) =>
  Boolean(card.plan_requested_at && (!card.plan_at || card.plan_requested_at > card.plan_at))

/** "org/repo" or "org/*" (what the repo setting accepts). */
export const validRepoEntry = (value: string) => /^[\w.-]+\/(?:[\w.-]+|\*)$/.test(value.trim())
