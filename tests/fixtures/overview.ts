import type { GitInfo, RepoOverview, RepoStatus } from '../../shared/types/repo'

export function makeGit(overrides: Partial<GitInfo> = {}): GitInfo {
  return {
    branch: 'develop',
    detached: false,
    headSha: 'abc1234',
    upstream: 'origin/develop',
    ahead: 0,
    behind: 0,
    defaultBranch: 'develop',
    vsDefault: null,
    workingTree: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, files: [], filesTruncated: false },
    stashCount: 0,
    lastCommit: { hash: 'abc1234', subject: 'Initial commit', author: 'Ada', date: '2026-10-15T10:00:00+00:00' },
    unpushed: [],
    incoming: [],
    branches: [{ name: 'develop', current: true, upstream: 'origin/develop', upstreamGone: false, ahead: 0, behind: 0, merged: false, lastCommitDate: '2026-10-15T10:00:00+00:00' }],
    remoteUrl: 'https://github.com/acme/widgets.git',
    lastFetchedAt: '2026-10-16T08:00:00.000Z',
    ...overrides,
  }
}

export const brokenRepo: RepoStatus = {
  name: 'widgets',
  path: '/work/widgets',
  root: '/work',
  git: makeGit({
    branch: 'feature/login',
    ahead: 2,
    workingTree: {
      staged: 1,
      unstaged: 1,
      untracked: 0,
      conflicted: 0,
      files: [
        { path: 'src/login.ts', index: 'M', worktree: '.', kind: 'staged' },
        { path: 'README.md', index: '.', worktree: 'M', kind: 'unstaged' },
      ],
      filesTruncated: false,
    },
    unpushed: [{ hash: 'f00ba12', subject: 'Add login form', author: 'Ada', date: '2026-10-16T07:00:00+00:00' }],
  }),
  github: {
    slug: 'acme/widgets',
    url: 'https://github.com/acme/widgets',
    private: true,
    archived: false,
    defaultBranch: 'develop',
    pushedAt: '2026-10-16T07:00:00Z',
    openIssues: 3,
    pullRequests: [{
      number: 12, title: 'Add login', url: 'https://github.com/acme/widgets/pull/12', author: 'ada', mine: true, draft: false,
      headRef: 'feature/login', baseRef: 'develop', reviewDecision: 'APPROVED', reviewRequestedFromMe: false,
      mergeable: 'MERGEABLE', checks: 'success', updatedAt: '2026-10-16T06:00:00Z',
    }],
    defaultBranchRuns: [{ workflow: 'CI', branch: 'develop', state: 'failure', event: 'push', url: 'https://github.com/acme/widgets/actions/runs/1', createdAt: '2026-10-16T06:00:00Z' }],
    currentBranchRuns: [],
  },
  githubError: null,
  gitError: null,
  attention: [
    { severity: 'critical', code: 'ci-default-failing', message: 'CI is failing on develop' },
    { severity: 'warning', code: 'unpushed', message: '2 commits not pushed to origin/feature/login' },
    { severity: 'warning', code: 'dirty', message: '2 uncommitted changes (1 staged, 1 unstaged)' },
  ],
  severity: 'critical',
  collectedAt: '2026-10-16T08:00:00.000Z',
}

export const cleanRepo: RepoStatus = {
  name: 'gadgets',
  path: '/work/gadgets',
  root: '/work',
  git: makeGit({ remoteUrl: 'https://github.com/acme/gadgets.git' }),
  github: null,
  githubError: 'GitHub data disabled',
  gitError: null,
  attention: [],
  severity: null,
  collectedAt: '2026-10-16T08:00:00.000Z',
}

export const overviewFixture: RepoOverview = {
  generatedAt: new Date().toISOString(),
  roots: ['/work'],
  viewer: 'ada',
  fetched: false,
  repos: [cleanRepo, brokenRepo],
}
