import { describe, expect, it } from 'vitest'
import { computeAttention, computeWorktreeAttention, highestSeverity } from '../../server/lib/attention'
import type { BranchInfo, GitInfo, GithubInfo, PullRequestInfo, WorktreeInfo } from '../../shared/types/repo'

function makeGit(overrides: Partial<GitInfo> = {}): GitInfo {
  return {
    branch: 'develop',
    detached: false,
    headSha: 'abc',
    upstream: 'origin/develop',
    ahead: 0,
    behind: 0,
    defaultBranch: 'develop',
    vsDefault: null,
    workingTree: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, files: [], filesTruncated: false },
    stashCount: 0,
    lastCommit: null,
    unpushed: [],
    incoming: [],
    branches: [],
    remoteUrl: 'https://github.com/o/r.git',
    lastFetchedAt: null,
    worktrees: [],
    ...overrides,
  }
}

function makeWorktree(overrides: Partial<WorktreeInfo> = {}): WorktreeInfo {
  return {
    path: '/w/lss-001-claude-workspace-4/r', label: 'Session 4', missing: false, branch: 'topic', detached: false, headSha: 'abc',
    upstream: 'origin/topic', ahead: 0, behind: 0, vsDefault: null, orphanCommits: 0,
    workingTree: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, files: [], filesTruncated: false },
    lastCommit: null, unpushed: [], gitError: null, attention: [],
    ...overrides,
  }
}

function makeBranch(overrides: Partial<BranchInfo> = {}): BranchInfo {
  return { name: 'topic', current: false, upstream: 'origin/topic', upstreamGone: false, ahead: 0, behind: 0, merged: false, lastCommitDate: '', worktreePath: null, ...overrides }
}

function makePull(overrides: Partial<PullRequestInfo> = {}): PullRequestInfo {
  return {
    number: 1, title: 't', url: 'u', author: 'me', mine: true, draft: false, headRef: 'h', baseRef: 'develop',
    reviewDecision: null, reviewRequestedFromMe: false, mergeable: 'MERGEABLE', checks: 'success', updatedAt: '',
    ...overrides,
  }
}

function makeGithub(overrides: Partial<GithubInfo> = {}): GithubInfo {
  return {
    slug: 'o/r', url: 'u', private: true, archived: false, defaultBranch: 'develop', pushedAt: null, openIssues: 0,
    pullRequests: [], defaultBranchRuns: [], currentBranchRuns: [],
    ...overrides,
  }
}

const codes = (items: ReturnType<typeof computeAttention>) => items.map(item => item.code)

describe('computeAttention (git)', () => {
  it('reports nothing for a clean, synced repository', () => {
    expect(computeAttention(makeGit(), null)).toEqual([])
    expect(highestSeverity([])).toBeNull()
  })

  it('flags conflicts as critical and sorts them first', () => {
    const items = computeAttention(makeGit({ stashCount: 1, workingTree: { staged: 0, unstaged: 1, untracked: 0, conflicted: 2, files: [], filesTruncated: false } }), null)

    expect(items[0]).toMatchObject({ code: 'conflicts', severity: 'critical' })
    expect(highestSeverity(items)).toBe('critical')
    expect(codes(items)).toContain('stash')
  })

  it('distinguishes unpushed, behind and diverged', () => {
    expect(codes(computeAttention(makeGit({ ahead: 2 }), null))).toEqual(['unpushed'])
    expect(codes(computeAttention(makeGit({ behind: 2 }), null))).toEqual(['behind'])
    expect(computeAttention(makeGit({ ahead: 1, behind: 1 }), null)[0]).toMatchObject({ code: 'diverged', severity: 'critical' })
  })

  it('flags a branch that is not pushed anywhere, with its distance from the default branch', () => {
    const [item] = computeAttention(makeGit({ branch: 'topic', upstream: null, vsDefault: { ahead: 3, behind: 0 } }), null)

    expect(item?.code).toBe('no-upstream')
    expect(item?.message).toContain('3 commits ahead of develop')
  })

  it('pluralizes words ending in s, sh and ch correctly', () => {
    const messages = computeAttention(makeGit({ stashCount: 2, branches: [makeBranch({ merged: true }), makeBranch({ name: 'b', merged: true })] }), null).map(item => item.message)

    expect(messages).toContain('2 stashes saved')
    expect(messages.join(' ')).toContain('2 local branches')
    expect(computeAttention(makeGit({ stashCount: 1 }), null).map(item => item.message)).toContain('1 stash saved')
  })

  it('flags a detached HEAD and does not complain about a missing upstream', () => {
    expect(codes(computeAttention(makeGit({ branch: null, detached: true, upstream: null }), null))).toEqual(['detached'])
  })

  it('separates branches with unpushed work from branches that can be deleted', () => {
    const git = makeGit({
      branches: [
        makeBranch({ name: 'current', current: true, ahead: 5 }),
        makeBranch({ name: 'wip', ahead: 2 }),
        makeBranch({ name: 'local-only', upstream: null }),
        makeBranch({ name: 'done', merged: true }),
        makeBranch({ name: 'gone', upstreamGone: true }),
      ],
    })
    const items = computeAttention(git, null)

    expect(items.find(item => item.code === 'unpushed-branches')?.message).toContain('wip, local-only')
    expect(items.find(item => item.code === 'unpushed-branches')?.message).not.toContain('current')
    expect(items.find(item => item.code === 'stale-branches')?.message).toContain('2 local branches')
  })

  it('does not call a merged branch with no upstream unpushed work', () => {
    const items = computeAttention(makeGit({ branches: [makeBranch({ name: 'done', upstream: null, merged: true })] }), null)

    expect(codes(items)).toEqual(['stale-branches'])
  })
})

describe('computeWorktreeAttention', () => {
  it('applies the checkout rules and labels every finding with the worktree', () => {
    const items = computeWorktreeAttention(makeWorktree({ ahead: 2, workingTree: { staged: 1, unstaged: 0, untracked: 3, conflicted: 0, files: [], filesTruncated: false } }), 'develop')

    expect(codes(items)).toEqual(['unpushed', 'dirty', 'untracked'])
    expect(items.every(item => item.worktree === 'Session 4')).toBe(true)
  })

  it('accepts a detached HEAD unless it holds commits no branch contains', () => {
    expect(computeWorktreeAttention(makeWorktree({ branch: null, detached: true, upstream: null }), 'develop')).toEqual([])
    expect(computeWorktreeAttention(makeWorktree({ branch: null, detached: true, upstream: null, orphanCommits: 2 }), 'develop')[0]).toMatchObject({
      code: 'detached', severity: 'warning', message: '2 commits on a detached HEAD that no branch contains',
    })
  })

  it('reports a missing folder and git errors instead of checkout state', () => {
    expect(codes(computeWorktreeAttention(makeWorktree({ missing: true, ahead: 3 }), 'develop'))).toEqual(['worktree-missing'])
    expect(codes(computeWorktreeAttention(makeWorktree({ gitError: 'boom', ahead: 3 }), 'develop'))).toEqual(['git-error'])
  })
})

describe('computeAttention (worktrees)', () => {
  it('includes the worktree findings and leaves branches checked out in a worktree to them', () => {
    const worktree = makeWorktree({ branch: 'wip', upstream: null })
    worktree.attention = computeWorktreeAttention(worktree, 'develop')
    const git = makeGit({
      worktrees: [worktree],
      branches: [makeBranch({ name: 'wip', upstream: null, worktreePath: worktree.path }), makeBranch({ name: 'old', merged: true, worktreePath: worktree.path })],
    })
    const items = computeAttention(git, null)

    expect(items).toEqual([{ severity: 'warning', code: 'no-upstream', message: 'Branch wip is not pushed anywhere', worktree: 'Session 4' }])
  })
})

describe('computeAttention (GitHub)', () => {
  it('treats a failing default-branch workflow as critical', () => {
    const run = { workflow: 'CI', branch: 'develop', state: 'failure' as const, event: 'push', url: '', createdAt: '' }
    const items = computeAttention(null, makeGithub({ defaultBranchRuns: [run] }))

    expect(items[0]).toMatchObject({ code: 'ci-default-failing', severity: 'critical' })
  })

  it('surfaces review requests, failing own PRs and PRs ready to merge', () => {
    const items = computeAttention(null, makeGithub({
      pullRequests: [
        makePull({ number: 1, mine: false, author: 'sam', reviewRequestedFromMe: true }),
        makePull({ number: 2, checks: 'failure' }),
        makePull({ number: 3, reviewDecision: 'APPROVED' }),
        makePull({ number: 4, reviewDecision: 'APPROVED', draft: true }),
        makePull({ number: 5, reviewDecision: 'APPROVED', mergeable: 'CONFLICTING' }),
      ],
    }))
    const byCode = Object.fromEntries(items.map(item => [item.code, item.message]))

    expect(byCode['review-requested']).toContain('#1')
    expect(byCode['pr-failing']).toContain('#2')
    expect(byCode['pr-ready']).toContain('#3')
    expect(byCode['pr-ready']).not.toMatch(/#[45]/)
    expect(byCode['pr-conflicting']).toContain('#5')
  })

  it('ignores PRs of other people unless a review is requested', () => {
    const items = computeAttention(null, makeGithub({ pullRequests: [makePull({ mine: false, author: 'sam', checks: 'failure' })] }))

    expect(items).toEqual([])
  })
})
