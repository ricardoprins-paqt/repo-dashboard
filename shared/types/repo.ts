export type Severity = 'critical' | 'warning' | 'info'

export interface AttentionItem {
  severity: Severity
  code: string
  message: string
}

export interface ChangedFile {
  path: string
  /** Index (staged) status letter, '.' when unchanged. */
  index: string
  /** Worktree (unstaged) status letter, '.' when unchanged. */
  worktree: string
  kind: 'staged' | 'unstaged' | 'untracked' | 'conflicted'
}

export interface CommitSummary {
  hash: string
  subject: string
  author: string
  date: string
}

export interface BranchInfo {
  name: string
  current: boolean
  upstream: string | null
  upstreamGone: boolean
  ahead: number
  behind: number
  merged: boolean
  lastCommitDate: string
}

export interface WorkingTreeInfo {
  staged: number
  unstaged: number
  untracked: number
  conflicted: number
  files: ChangedFile[]
  filesTruncated: boolean
}

export interface GitInfo {
  branch: string | null
  detached: boolean
  headSha: string | null
  upstream: string | null
  ahead: number
  behind: number
  defaultBranch: string | null
  /** Current branch compared with the remote default branch. */
  vsDefault: { ahead: number, behind: number } | null
  workingTree: WorkingTreeInfo
  stashCount: number
  lastCommit: CommitSummary | null
  unpushed: CommitSummary[]
  incoming: CommitSummary[]
  branches: BranchInfo[]
  remoteUrl: string | null
  lastFetchedAt: string | null
}

export type CheckState = 'success' | 'failure' | 'pending' | 'none'

export interface PullRequestInfo {
  number: number
  title: string
  url: string
  author: string
  mine: boolean
  draft: boolean
  headRef: string
  baseRef: string
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  reviewRequestedFromMe: boolean
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  checks: CheckState
  updatedAt: string
}

export interface WorkflowRunInfo {
  workflow: string
  branch: string
  state: CheckState
  event: string
  url: string
  createdAt: string
}

export interface GithubInfo {
  slug: string
  url: string
  private: boolean
  archived: boolean
  defaultBranch: string
  pushedAt: string | null
  openIssues: number
  pullRequests: PullRequestInfo[]
  /** Latest run per workflow on the default branch. */
  defaultBranchRuns: WorkflowRunInfo[]
  /** Latest run per workflow on the branch currently checked out. */
  currentBranchRuns: WorkflowRunInfo[]
}

export interface RepoStatus {
  name: string
  path: string
  root: string
  git: GitInfo | null
  github: GithubInfo | null
  /** Why GitHub data is missing (no remote, not GitHub, gh error). */
  githubError: string | null
  /** Why git data is missing. */
  gitError: string | null
  attention: AttentionItem[]
  /** Highest severity in `attention`, or null when the repo is all clear. */
  severity: Severity | null
  collectedAt: string
}

export interface RepoOverview {
  generatedAt: string
  roots: string[]
  viewer: string | null
  fetched: boolean
  repos: RepoStatus[]
}
