import { describe, expect, it } from 'vitest'
import { filterRepos, relativeTime, sortRepos, summarize } from '../../app/utils/overview'
import { makeGit, makeWorktree } from '../fixtures/overview'
import type { RepoOverview, RepoStatus } from '../../shared/types/repo'

function repo(name: string, overrides: Partial<RepoStatus> = {}): RepoStatus {
  return {
    name, path: `/w/${name}`, root: '/w', git: null, github: null, githubError: null, gitError: null,
    attention: [], severity: null, collectedAt: '', ...overrides,
  }
}

const critical = repo('broken', { severity: 'critical', attention: [{ severity: 'critical', code: 'x', message: 'x' }, { severity: 'warning', code: 'y', message: 'y' }] })
const warning = repo('wip', { severity: 'warning', attention: [{ severity: 'warning', code: 'dirty', message: 'dirty' }] })
const clean = repo('clean')

describe('sortRepos', () => {
  it('puts the most urgent first, then repos with more findings, then by name', () => {
    const other = repo('alpha', { severity: 'warning', attention: [{ severity: 'warning', code: 'dirty', message: 'dirty' }] })

    expect(sortRepos([clean, warning, other, critical], 'attention').map(item => item.name)).toEqual(['broken', 'alpha', 'wip', 'clean'])
  })

  it('sorts by name and does not mutate the input', () => {
    const input = [warning, critical, clean]

    expect(sortRepos(input, 'name').map(item => item.name)).toEqual(['broken', 'clean', 'wip'])
    expect(input.map(item => item.name)).toEqual(['wip', 'broken', 'clean'])
  })
})

describe('filterRepos', () => {
  it('filters by attention level and by search text', () => {
    const repos = [critical, warning, clean]

    expect(filterRepos(repos, 'attention', '').map(item => item.name)).toEqual(['broken', 'wip'])
    expect(filterRepos(repos, 'clean', '').map(item => item.name)).toEqual(['clean'])
    expect(filterRepos(repos, 'all', ' WIP ').map(item => item.name)).toEqual(['wip'])
  })
})

describe('filterRepos with worktrees', () => {
  it('counts changes, unpushed commits and branches of linked worktrees', () => {
    const withWorktree = repo('shared', { git: makeGit({ worktrees: [makeWorktree({ branch: 'feature/signup', upstream: 'origin/feature/signup', ahead: 1, behind: 2 })] }) })
    const plain = repo('plain', { git: makeGit() })
    const repos = [withWorktree, plain]

    expect(filterRepos(repos, 'uncommitted', '').map(item => item.name)).toEqual(['shared'])
    expect(filterRepos(repos, 'unpushed', '').map(item => item.name)).toEqual(['shared'])
    expect(filterRepos(repos, 'behind', '').map(item => item.name)).toEqual(['shared'])
    expect(filterRepos(repos, 'all', 'signup').map(item => item.name)).toEqual(['shared'])
  })
})

describe('summarize', () => {
  it('handles a missing overview', () => {
    expect(summarize(null)).toMatchObject({ repos: 0, openPrs: 0, githubLoaded: false })
  })

  it('counts severities', () => {
    const overview: RepoOverview = { generatedAt: '', roots: [], viewer: null, fetched: false, repos: [critical, warning, clean] }

    expect(summarize(overview)).toMatchObject({ repos: 3, critical: 1, warning: 1, clean: 1 })
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')

  it('formats past times and missing values', () => {
    expect(relativeTime('2026-10-16T09:00:00Z', now)).toBe('3 hours ago')
    expect(relativeTime('2026-10-14T12:00:00Z', now)).toBe('2 days ago')
    expect(relativeTime('2026-10-16T11:59:50Z', now)).toBe('just now')
    expect(relativeTime(null, now)).toBe('never')
  })
})
