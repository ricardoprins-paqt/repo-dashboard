import { describe, expect, it } from 'vitest'
import type { Achievement, Summary } from '../../shared/types/focus'
import { summaryDays, summaryPending, withoutLeadingH1 } from '../../app/utils/summary'

const ach = (date: string, updated: string, id = 1): Achievement => ({ id, date, highlights: '- a', items: ['x'], covered_until: updated, created: updated, updated })
const fyi = (date: string, created: string, id = 1): Summary => ({ id, date, content: '- y', items: [], created })

describe('summaryDays', () => {
  it('puts achievements and FYI summaries of the same day together, newest day first', () => {
    const days = summaryDays([ach('2026-11-07', '2026-11-07T23:00:00Z')], [fyi('2026-11-07', '2026-11-07T17:00:00Z'), fyi('2026-11-06', '2026-11-06T17:00:00Z', 2)])
    expect(days.map(d => [d.date, Boolean(d.achievement), d.fyis.length])).toEqual([['2026-11-07', true, 1], ['2026-11-06', false, 1]])
  })
  it('keeps the latest achievements entry of a day and at most the given number of days', () => {
    const days = summaryDays([ach('2026-11-07', '2026-11-07T17:00:00Z', 1), ach('2026-11-07', '2026-11-07T23:00:00Z', 2), ach('2026-11-05', '2026-11-05T17:00:00Z', 3)], [], 1)
    expect(days).toHaveLength(1)
    expect(days[0]!.achievement!.id).toBe(2)
  })
})

describe('summaryPending', () => {
  const at = '2026-11-07T20:00:00Z'
  it('is pending until a newer FYI summary or achievements update arrives', () => {
    expect(summaryPending(null, [], [])).toBe(false)
    expect(summaryPending(at, [fyi('2026-11-07', '2026-11-07T17:00:00Z')], [ach('2026-11-07', '2026-11-07T18:00:00Z')])).toBe(true)
    expect(summaryPending(at, [fyi('2026-11-07', '2026-11-07T20:05:00Z')], [])).toBe(false)
    expect(summaryPending(at, [], [ach('2026-11-07', '2026-11-07T20:05:00Z')])).toBe(false)
  })
})

describe('withoutLeadingH1', () => {
  it('drops a leading level-1 heading, so the page section titles stay on top', () => {
    expect(withoutLeadingH1('# FYI summary, 7 Nov 2026\n\n- merged #12\n')).toBe('- merged #12\n')
    expect(withoutLeadingH1('  # Title\n- a')).toBe('- a')
  })
  it('keeps everything else', () => {
    expect(withoutLeadingH1('- a\n# not leading')).toBe('- a\n# not leading')
    expect(withoutLeadingH1('## A subheading\n- a')).toBe('## A subheading\n- a')
  })
})
