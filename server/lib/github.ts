import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CheckState, GithubInfo, PullRequestInfo, WorkflowRunInfo } from '../../shared/types/repo.ts'

const execFileAsync = promisify(execFile)

async function gh<T>(args: string[], cwd?: string): Promise<T> {
  const { stdout } = await execFileAsync('gh', args, {
    ...(cwd ? { cwd } : {}),
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' },
  })
  return JSON.parse(stdout) as T
}

export async function fetchViewer(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['api', 'user', '--jq', '.login'], { timeout: 15_000 })
    return stdout.trim() || null
  }
  catch {
    return null
  }
}

interface RawCheck {
  __typename?: string
  status?: string
  conclusion?: string | null
  /** StatusContext state. */
  state?: string
}

/** Collapses a PR's check rollup into one state. Any failure wins, then anything still running. */
export function summarizeChecks(checks: RawCheck[] | null | undefined): CheckState {
  if (!checks || checks.length === 0) return 'none'
  let pending = false
  for (const check of checks) {
    if (check.__typename === 'StatusContext') {
      const state = (check.state ?? '').toUpperCase()
      if (state === 'FAILURE' || state === 'ERROR') return 'failure'
      if (state === 'PENDING' || state === 'EXPECTED') pending = true
      continue
    }
    if ((check.status ?? '').toUpperCase() !== 'COMPLETED') {
      pending = true
      continue
    }
    const conclusion = (check.conclusion ?? '').toUpperCase()
    if (['FAILURE', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED'].includes(conclusion)) return 'failure'
  }
  return pending ? 'pending' : 'success'
}

export function runState(status: string, conclusion: string | null | undefined): CheckState {
  if (status.toLowerCase() !== 'completed') return 'pending'
  const value = (conclusion ?? '').toLowerCase()
  if (value === 'success') return 'success'
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(value)) return 'failure'
  // Cancelled, skipped and neutral runs say nothing about the health of the branch.
  return 'none'
}

interface RawRepo {
  defaultBranchRef: { name: string } | null
  isArchived: boolean
  isPrivate: boolean
  pushedAt: string | null
  issues: { totalCount: number }
  url: string
}

interface RawPullRequest {
  number: number
  title: string
  url: string
  author: { login: string } | null
  isDraft: boolean
  headRefName: string
  baseRefName: string
  reviewDecision: string
  reviewRequests: Array<{ __typename?: string, login?: string }>
  mergeable: string
  statusCheckRollup: RawCheck[]
  updatedAt: string
}

interface RawRun {
  workflowName: string
  status: string
  conclusion: string | null
  headBranch: string
  event: string
  url: string
  createdAt: string
}

export function latestRunPerWorkflow(runs: RawRun[]): WorkflowRunInfo[] {
  const seen = new Map<string, WorkflowRunInfo>()
  const sorted = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const run of sorted) {
    if (seen.has(run.workflowName)) continue
    seen.set(run.workflowName, {
      workflow: run.workflowName,
      branch: run.headBranch,
      state: runState(run.status, run.conclusion),
      event: run.event,
      url: run.url,
      createdAt: run.createdAt,
    })
  }
  return [...seen.values()]
}

function toPullRequest(raw: RawPullRequest, viewer: string | null): PullRequestInfo {
  const author = raw.author?.login ?? 'unknown'
  const decision = raw.reviewDecision
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    author,
    mine: viewer !== null && author === viewer,
    draft: raw.isDraft,
    headRef: raw.headRefName,
    baseRef: raw.baseRefName,
    reviewDecision: decision === 'APPROVED' || decision === 'CHANGES_REQUESTED' || decision === 'REVIEW_REQUIRED' ? decision : null,
    reviewRequestedFromMe: viewer !== null && raw.reviewRequests.some(request => request.login === viewer),
    mergeable: raw.mergeable === 'MERGEABLE' || raw.mergeable === 'CONFLICTING' ? raw.mergeable : 'UNKNOWN',
    checks: summarizeChecks(raw.statusCheckRollup),
    updatedAt: raw.updatedAt,
  }
}

async function runsFor(slug: string, branch: string | null): Promise<WorkflowRunInfo[]> {
  if (!branch) return []
  try {
    const runs = await gh<RawRun[]>([
      'run', 'list', '-R', slug, '--branch', branch, '--limit', '30',
      '--json', 'workflowName,status,conclusion,headBranch,event,url,createdAt',
    ])
    return latestRunPerWorkflow(runs)
  }
  catch {
    // Repos without Actions (or without access to them) simply have no runs.
    return []
  }
}

export async function collectGithub(slug: string, currentBranch: string | null, viewer: string | null): Promise<GithubInfo> {
  const [repo, pulls] = await Promise.all([
    gh<RawRepo>(['repo', 'view', slug, '--json', 'defaultBranchRef,isArchived,isPrivate,pushedAt,issues,url']),
    gh<RawPullRequest[]>([
      'pr', 'list', '-R', slug, '--state', 'open', '--limit', '50',
      '--json', 'number,title,url,author,isDraft,headRefName,baseRefName,reviewDecision,reviewRequests,mergeable,statusCheckRollup,updatedAt',
    ]),
  ])

  const defaultBranch = repo.defaultBranchRef?.name ?? 'main'
  const [defaultBranchRuns, currentBranchRuns] = await Promise.all([
    runsFor(slug, defaultBranch),
    currentBranch && currentBranch !== defaultBranch ? runsFor(slug, currentBranch) : Promise.resolve([]),
  ])

  return {
    slug,
    url: repo.url,
    private: repo.isPrivate,
    archived: repo.isArchived,
    defaultBranch,
    pushedAt: repo.pushedAt,
    openIssues: repo.issues.totalCount,
    pullRequests: pulls.map(pull => toPullRequest(pull, viewer)),
    defaultBranchRuns,
    currentBranchRuns,
  }
}
