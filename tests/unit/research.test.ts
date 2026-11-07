import { describe, expect, it } from 'vitest'
import type { ResearchPlan, ResearchQuestion } from '../../shared/types/research'
import { answerText, groupPlans, heartbeatState, highestWeekly, splitQuestions } from '../../app/utils/research'

const q = (id: string, answered = false): ResearchQuestion => ({
  id, experiment: null, kind: 'question', title: id, context: '', options: ['A', 'B'], recommendation: 'A', blocks: null, status: null,
  answer: answered ? { text: 'x', at: '2026-11-07T10:00:00Z', delivered_at: null } : null,
})
const plan = (file: string, decision: ResearchPlan['decision']): ResearchPlan => ({
  file, title: file, sha256: 'abc', content: '', meta: { validFrom: null, validUntil: null, budgetPoints: 5 }, decision,
})
const decided = (status: 'approved' | 'rejected', current: boolean) => ({ status, at: '2026-11-07T10:00:00Z', comment: null, validFrom: null, validUntil: null, budgetPoints: 5, current })

describe('research page', () => {
  it('shows the unanswered questions in the loop\'s order, one at a time', () => {
    const { open, answered } = splitQuestions([q('Q-1', true), q('Q-2'), q('Q-3')])
    expect(open.map(x => x.id)).toEqual(['Q-2', 'Q-3'])
    expect(answered.map(x => x.id)).toEqual(['Q-1'])
  })

  it('puts plans that need a decision first, also when they changed after one', () => {
    const { waiting, decided: done } = groupPlans([plan('a.md', decided('approved', true)), plan('b.md', null), plan('c.md', decided('approved', false))])
    expect(waiting.map(p => p.file)).toEqual(['b.md', 'c.md'])
    expect(done.map(p => p.file)).toEqual(['a.md'])
  })

  it('marks a quiet heartbeat at 30 minutes and a stall at 60', () => {
    expect(heartbeatState(null)).toBe('none')
    expect(heartbeatState(5)).toBe('ok')
    expect(heartbeatState(30)).toBe('warn')
    expect(heartbeatState(60)).toBe('stalled')
  })

  it('takes the highest weekly limit', () => {
    expect(highestWeekly({ session: 10, weekly: [{ label: 'week', percent: 31 }, { label: 'week (Fable)', percent: 40 }] })).toEqual({ label: 'week (Fable)', percent: 40 })
    expect(highestWeekly(null)).toBeNull()
  })

  it('builds the answer from an option, the recommendation and what he typed', () => {
    expect(answerText(q('Q-1'), 1, '')).toBe('B')
    expect(answerText(q('Q-1'), -1, 'but only on weekends')).toBe('A. but only on weekends')
    expect(answerText(q('Q-1'), null, '  free text ')).toBe('free text')
    expect(answerText(q('Q-1'), null, '')).toBe('')
  })
})
