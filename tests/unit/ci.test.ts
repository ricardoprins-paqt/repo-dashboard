import { describe, expect, it } from 'vitest'
import type { CiRun } from '../../shared/types/ci'
import { buildRows, durationTrend, failingSince, isCiRun, toCiRun, type RawActionsRun } from '../../server/lib/ci'
import { CiStore } from '../../server/lib/ci-store'
import { durationTrend as trendLabel, elapsed, formatDuration, formatRunTime } from '../../app/utils/ci'

let nextId = 1
function run(state: 'success' | 'failure' | 'pending' | 'cancelled', createdAt: string, extra: Partial<CiRun> = {}): CiRun {
  return {
    id: nextId++, repo: 'app', workflowId: 1, workflow: 'CI', path: '.github/workflows/ci.yml', branch: 'develop', event: 'push',
    status: state === 'pending' ? 'in_progress' : 'completed',
    conclusion: state === 'pending' ? null : state,
    state: state === 'cancelled' ? 'none' : state,
    sha: `sha${nextId}`, title: 'A commit', author: 'Ann', attempt: 1,
    createdAt, startedAt: createdAt, updatedAt: createdAt, durationS: state === 'pending' ? null : 100, url: 'https://github.com/x',
    ...extra,
  }
}

describe('failingSince', () => {
  it('is null when the latest verdict is green', () => {
    expect(failingSince([run('pending', '2026-11-03'), run('success', '2026-11-02'), run('failure', '2026-11-01')])).toBeNull()
  })

  it('finds the first failure after the last green run, skipping cancelled and running ones', () => {
    const first = run('failure', '2026-11-02')
    const runs = [run('pending', '2026-11-05'), run('failure', '2026-11-04'), run('cancelled', '2026-11-03'), first, run('success', '2026-11-01')]
    expect(failingSince(runs)).toEqual({ run: first, count: 2, beforeHistory: false })
  })

  it('says when there is no green run in the history', () => {
    const oldest = run('failure', '2026-11-01')
    expect(failingSince([run('failure', '2026-11-02'), oldest])).toEqual({ run: oldest, count: 2, beforeHistory: true })
  })
})

describe('durationTrend', () => {
  it('averages green runs, newest window against the one before', () => {
    const runs = [
      ...Array.from({ length: 10 }, (_, i) => run('success', `2026-11-${String(20 - i).padStart(2, '0')}`, { durationS: 120 })),
      run('failure', '2026-11-10', { durationS: 5 }),
      ...Array.from({ length: 10 }, (_, i) => run('success', `2026-10-${String(20 - i).padStart(2, '0')}`, { durationS: 100 })),
    ]
    expect(durationTrend(runs)).toEqual({ avg: 120, previous: 100 })
  })

  it('has no previous average with too little history', () => {
    expect(durationTrend([run('success', '2026-11-01', { durationS: 60 })])).toEqual({ avg: 60, previous: null })
  })
})

describe('buildRows', () => {
  it('puts red first, the longest red at the top, then running, then green', () => {
    const rows = buildRows([
      run('success', '2026-11-05', { repo: 'green' }),
      run('failure', '2026-11-05', { repo: 'red-short' }),
      run('failure', '2026-10-01', { repo: 'red-long' }),
      run('pending', '2026-11-05', { repo: 'busy' }),
      run('success', '2026-11-01', { repo: 'busy' }),
    ])
    expect(rows.map(row => row.repo)).toEqual(['red-long', 'red-short', 'busy', 'green'])
    expect(rows[2]).toMatchObject({ running: true, state: 'success' })
  })
})

describe('toCiRun', () => {
  const raw: RawActionsRun = {
    id: 7, name: 'CI', path: '.github/workflows/ci.yml@refs/heads/develop', workflow_id: 3, head_branch: 'develop', head_sha: 'abc',
    event: 'push', status: 'completed', conclusion: 'failure', run_attempt: 2, created_at: '2026-11-01T10:00:00Z',
    run_started_at: '2026-11-01T10:00:10Z', updated_at: '2026-11-01T10:05:10Z', html_url: 'https://github.com/o/r/actions/runs/7',
    actor: { login: 'ann' }, head_commit: { message: 'Fix login\n\nLonger text', author: { name: 'Ann' } },
  }

  it('maps the fields the page uses', () => {
    expect(toCiRun('r', raw)).toMatchObject({ id: 7, path: '.github/workflows/ci.yml', state: 'failure', title: 'Fix login', author: 'Ann', durationS: 300, attempt: 2 })
  })

  it('ignores durations that are not real (updated_at moved months later)', () => {
    expect(toCiRun('r', { ...raw, updated_at: '2026-12-01T10:00:00Z' }).durationS).toBeNull()
  })

  it('leaves out pull request runs and Dependabot updates', () => {
    expect(isCiRun({ event: 'push', path: '.github/workflows/ci.yml' })).toBe(true)
    expect(isCiRun({ event: 'pull_request', path: '.github/workflows/ci.yml' })).toBe(false)
    expect(isCiRun({ event: 'dynamic', path: 'dynamic/dependabot/dependabot-updates' })).toBe(false)
  })
})

describe('CiStore', () => {
  it('upserts runs and keeps the newest per workflow', () => {
    const store = new CiStore(':memory:')
    const a = run('pending', '2026-11-02', { id: 100 })
    store.upsertRuns([a, run('success', '2026-11-01', { id: 99 }), run('success', '2026-11-01', { id: 98, workflowId: 2 })])
    expect(store.unfinishedRuns('app')).toEqual([100])
    store.upsertRuns([{ ...a, status: 'completed', conclusion: 'failure', state: 'failure', durationS: 50 }])
    expect(store.run(100)).toMatchObject({ state: 'failure', durationS: 50 })
    expect(store.unfinishedRuns('app')).toEqual([])
    expect(store.recentRuns(1).map(r => r.id).sort()).toEqual([100, 98].sort())
    expect(store.newestRunId('app')).toBe(100)
  })

  it('caches explanations per run', () => {
    const store = new CiStore(':memory:')
    expect(store.explanation(1)).toBeNull()
    store.saveExplanation({ runId: 1, createdAt: 'now', model: 'm', failed: 'x', cause: 'y', kind: 'code', fix: 'z', confidence: 'high', confidenceReason: '', steps: [] })
    expect(store.explanation(1)?.cause).toBe('y')
    expect(store.explainedRunIds()).toEqual([1])
  })
})

describe('page formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(200)).toBe('3 min 20 s')
    expect(formatDuration(1500)).toBe('25 min')
    expect(formatDuration(3900)).toBe('1 h 5 min')
    expect(formatDuration(null)).toBe('–')
  })

  it('says when a run started', () => {
    const now = new Date(2026, 10, 6, 15, 0)
    expect(formatRunTime(new Date(2026, 10, 6, 11, 31).toISOString(), now)).toBe('11:31 today')
    expect(formatRunTime(new Date(2026, 10, 5, 9, 5).toISOString(), now)).toBe('09:05 yesterday')
    expect(formatRunTime(new Date(2026, 7, 6, 11, 31).toISOString(), now)).toBe('11:31 on 6 Aug')
    expect(formatRunTime(new Date(2025, 11, 6, 11, 31).toISOString(), now)).toBe('11:31 on 6 Dec 2025')
  })

  it('says how long', () => {
    const now = Date.parse('2026-11-06T12:00:00Z')
    expect(elapsed('2026-11-04T11:00:00Z', now)).toBe('2 days')
    expect(elapsed('2026-11-06T11:59:30Z', now)).toBe('less than a minute')
  })

  it('mentions a trend from 10 %', () => {
    expect(trendLabel({ avgDurationS: 130, previousAvgDurationS: 100 })).toEqual({ label: '30% slower than the 10 runs before', slower: true })
    expect(trendLabel({ avgDurationS: 105, previousAvgDurationS: 100 })?.label).toBe('about as fast as the 10 runs before')
    expect(trendLabel({ avgDurationS: 100, previousAvgDurationS: null })).toBeNull()
  })
})

describe('CiStore.forgetArchived', () => {
  it('hides an archived repo but keeps its runs', () => {
    const store = new CiStore(':memory:')
    store.saveRepo({ name: 'app', defaultBranch: 'main', url: '', access: 'ok', error: null, pushedAt: null, hasRuns: true, checkedAt: null })
    store.upsertRuns([run('success', '2026-11-01', { id: 500 })])
    store.forgetArchived(['app'])
    expect(store.repo('app')).toBeNull()
    expect(store.run(500)).not.toBeNull()
  })
})
