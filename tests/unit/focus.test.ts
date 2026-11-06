import { describe, expect, it } from 'vitest'
import type { Card, FocusPr } from '#shared/types/focus'
import type { InboxItem, InboxTask } from '#shared/types/inbox'
import { hiddenAsFyi, planPending, prOnCard, prsByCard, splitByFocus, validRepoEntry } from '../../app/utils/focus'
import { classifyPrs, searchQuery, type RawPr } from '../../server/lib/focus-prs'

const task = { id: 1 } as InboxTask
const entry = (id: number, fields: Partial<InboxItem> = {}) => ({ item: { id, kind: 'decision', severity: 'normal', needs_you: true, card_id: null, ...fields } as InboxItem, task })
const card = (id: number, fields: Partial<Card> = {}): Card => ({ id, title: `card ${id}`, note: '', links: [], status: 'focused', position: id, created: '', updated: '', plan: null, plan_requested_at: null, plan_at: null, ...fields })
const pr = (repo: string, number: number): FocusPr => ({ repo, number, title: 't', url: `https://github.com/${repo}/pull/${number}`, author: 'kaj', created: '2026-11-01T00:00:00Z', lane: null, checks: 'none', reason: 'requested' })

describe('the inbox split by focus', () => {
  const cards = [{ id: 1, status: 'focused' as const }, { id: 2, status: 'parked' as const }]
  it('shows focused cards and critical items now, folds the rest, and leaves FYIs out', () => {
    const { now, notNow } = splitByFocus([
      entry(10, { card_id: 1 }),
      entry(11, { card_id: 2 }),
      entry(12),
      entry(13, { severity: 'critical' }),
      entry(14, { kind: 'fyi', card_id: 1 }),
      entry(15, { kind: 'fyi', severity: 'critical' }),
      entry(16, { card_id: 99 }),
    ], cards)
    expect(now.map(e => e.item.id)).toEqual([10, 13, 15])
    expect(notNow.map(e => e.item.id)).toEqual([11, 12, 16])
  })
  it('with no cards at all, only critical items show now', () => {
    const { now, notNow } = splitByFocus([entry(1), entry(2, { severity: 'critical' })], [])
    expect(now.map(e => e.item.id)).toEqual([2])
    expect(notNow.map(e => e.item.id)).toEqual([1])
  })
  it('an FYI is hidden unless it is critical', () => {
    expect(hiddenAsFyi({ kind: 'fyi', severity: 'normal' })).toBe(true)
    expect(hiddenAsFyi({ kind: 'fyi', severity: 'critical' })).toBe(false)
    expect(hiddenAsFyi({ kind: 'review', severity: 'normal' })).toBe(false)
  })
})

describe('PRs on cards', () => {
  it('a PR is on a card when a link is the PR or its repository', () => {
    const p = pr('paqtdesign/paqt-ds', 12)
    expect(prOnCard(p, card(1, { links: [{ label: '', url: 'https://github.com/paqtdesign/paqt-ds/pull/12/' }] }))).toBe(true)
    expect(prOnCard(p, card(1, { links: [{ label: 'design system', url: 'https://github.com/paqtdesign/paqt-ds' }] }))).toBe(true)
    expect(prOnCard(p, card(1, { links: [{ label: 'paqtdesign/paqt-ds', url: 'paqtdesign/paqt-ds' }] }))).toBe(true)
    expect(prOnCard(p, card(1, { links: [{ label: '', url: 'https://github.com/paqtdesign/paqt-ds/pull/13' }] }))).toBe(false)
    expect(prOnCard(p, card(1, { links: [{ label: '', url: 'https://github.com/paqtdesign/paqt-ds-docs' }] }))).toBe(false)
  })
  it('groups PRs per card; the rest are on no card', () => {
    const cards = [card(1, { links: [{ label: '', url: 'paqtdesign/paqt-ds' }] }), card(2, { links: [{ label: '', url: 'https://github.com/paqtdesign/paqt-ds/pull/5' }] })]
    const { byCard, loose } = prsByCard([pr('paqtdesign/paqt-ds', 5), pr('paqtcom/cibapp', 7)], cards)
    expect(byCard.get(1)?.map(p => p.number)).toEqual([5])
    expect(byCard.get(2)?.map(p => p.number)).toEqual([5])
    expect(loose.map(p => p.number)).toEqual([7])
  })
})

describe('PRs waiting for Ricardo', () => {
  const raw = (number: number, fields: Partial<RawPr> & { label?: string } = {}): RawPr => ({
    number, title: `pr ${number}`, url: `https://github.com/o/r/pull/${number}`, isDraft: false, createdAt: `2026-11-0${number}T00:00:00Z`,
    author: { login: 'kaj' }, repository: { nameWithOwner: 'o/r' },
    labels: { nodes: fields.label ? [{ name: fields.label }] : [] },
    latestReviews: { nodes: [] }, reviewRequests: { nodes: [] }, commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
    ...fields,
  })
  const approvedBy = (login: string, type = 'User') => ({ latestReviews: { nodes: [{ state: 'APPROVED', author: { login, __typename: type } }] } })
  it('sorts PRs into "your review" and "quick approval"; a human approval takes a fast PR off', () => {
    const { review, quick } = classifyPrs([
      raw(1, { reviewRequests: { nodes: [{ requestedReviewer: { __typename: 'User', login: 'Ricardo' } }] } }),
      raw(2, { label: 'lane: careful' }),
      raw(3, { label: 'lane: careful', ...approvedBy('ricardo') }),
      raw(4, { label: 'lane: fast' }),
      raw(5, { label: 'lane: fast', ...approvedBy('jenny') }),
      raw(6, { label: 'lane: fast', ...approvedBy('copilot-pull-request-reviewer', 'Bot') }),
      raw(7, { label: 'lane: careful', author: { login: 'ricardo' } }),
      raw(8, { label: 'lane: fast', isDraft: true }),
      raw(9),
    ], 'ricardo')
    expect(review.map(p => [p.number, p.reason])).toEqual([[1, 'requested'], [2, 'careful']])
    expect(quick.map(p => p.number)).toEqual([4, 6])
    expect(review[0]?.checks).toBe('success')
  })
  it('searches open, non-draft PRs in the chosen repos and organisations', () => {
    expect(searchQuery(['paqtdesign/*', 'paqtcom/cibapp'])).toBe('is:pr is:open draft:false archived:false org:paqtdesign repo:paqtcom/cibapp')
  })
})

describe('focus helpers', () => {
  it('a plan is pending when it was asked for after the last plan', () => {
    expect(planPending({ plan_requested_at: '2026-11-06T10:00:00Z', plan_at: null })).toBe(true)
    expect(planPending({ plan_requested_at: '2026-11-06T10:00:00Z', plan_at: '2026-11-06T10:05:00Z' })).toBe(false)
    expect(planPending({ plan_requested_at: null, plan_at: null })).toBe(false)
  })
  it('repo setting entries are org/repo or org/*', () => {
    expect(validRepoEntry('paqtcom/cibapp')).toBe(true)
    expect(validRepoEntry('paqtdesign/*')).toBe(true)
    expect(validRepoEntry('cibapp')).toBe(false)
    expect(validRepoEntry('a/b/c')).toBe(false)
  })
})
