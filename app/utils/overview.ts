import type { CheckState, RepoOverview, RepoStatus, Severity, WorktreeInfo } from '#shared/types/repo'

export type RepoFilter = 'all' | 'attention' | 'uncommitted' | 'unpushed' | 'behind' | 'ci-failing' | 'prs' | 'clean'
export type RepoSort = 'attention' | 'name' | 'activity'

export const FILTERS: Array<{ id: RepoFilter, label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'uncommitted', label: 'Uncommitted' },
  { id: 'unpushed', label: 'Unpushed' },
  { id: 'behind', label: 'Behind remote' },
  { id: 'ci-failing', label: 'CI failing' },
  { id: 'prs', label: 'Open PRs' },
  { id: 'clean', label: 'Clean' },
]

export const SORTS: Array<{ label: string, value: RepoSort }> = [
  { label: 'Most urgent first', value: 'attention' },
  { label: 'Name', value: 'name' },
  { label: 'Latest commit', value: 'activity' },
]

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
const severityRank = (severity: Severity | null) => (severity === null ? 3 : SEVERITY_RANK[severity])

export function hasFailingCi(repo: RepoStatus): boolean {
  const runs = [...(repo.github?.defaultBranchRuns ?? []), ...(repo.github?.currentBranchRuns ?? [])]
  return runs.some(run => run.state === 'failure') || (repo.github?.pullRequests.some(pull => pull.checks === 'failure') ?? false)
}

/** The main checkout and the linked worktrees: each has its own working tree and branch. */
function checkouts(repo: RepoStatus): Array<Pick<WorktreeInfo, 'workingTree' | 'ahead' | 'behind' | 'branch'>> {
  return repo.git ? [repo.git, ...repo.git.worktrees] : []
}

export function matchesFilter(repo: RepoStatus, filter: RepoFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'attention': return repo.severity === 'critical' || repo.severity === 'warning'
    case 'uncommitted': return checkouts(repo).some(({ workingTree }) => workingTree.staged + workingTree.unstaged + workingTree.untracked > 0)
    case 'unpushed': return checkouts(repo).some(checkout => checkout.ahead > 0) || repo.attention.some(item => item.code === 'unpushed-branches' || item.code === 'no-upstream')
    case 'behind': return checkouts(repo).some(checkout => checkout.behind > 0)
    case 'ci-failing': return hasFailingCi(repo)
    case 'prs': return (repo.github?.pullRequests.length ?? 0) > 0
    case 'clean': return repo.severity === null
  }
}

export function filterRepos(repos: RepoStatus[], filter: RepoFilter, search: string): RepoStatus[] {
  const needle = search.trim().toLowerCase()
  return repos.filter((repo) => {
    if (!matchesFilter(repo, filter)) return false
    if (!needle) return true
    return repo.name.toLowerCase().includes(needle)
      || checkouts(repo).some(checkout => (checkout.branch ?? '').toLowerCase().includes(needle))
      || (repo.github?.pullRequests.some(pull => pull.title.toLowerCase().includes(needle)) ?? false)
  })
}

export function sortRepos(repos: RepoStatus[], sort: RepoSort): RepoStatus[] {
  const sorted = [...repos]
  const byName = (a: RepoStatus, b: RepoStatus) => a.name.localeCompare(b.name)
  if (sort === 'name') return sorted.sort(byName)
  if (sort === 'activity') {
    return sorted.sort((a, b) => (b.git?.lastCommit?.date ?? '').localeCompare(a.git?.lastCommit?.date ?? '') || byName(a, b))
  }
  return sorted.sort((a, b) => {
    const rank = severityRank(a.severity) - severityRank(b.severity)
    if (rank !== 0) return rank
    // Within one severity, repos with more findings come first.
    return b.attention.length - a.attention.length || byName(a, b)
  })
}

export interface OverviewSummary {
  repos: number
  critical: number
  warning: number
  clean: number
  uncommitted: number
  unpushed: number
  behind: number
  ciFailing: number
  openPrs: number
  myPrs: number
  reviewRequests: number
  readyToMerge: number
  githubLoaded: boolean
}

export function summarize(overview: RepoOverview | null): OverviewSummary {
  const repos = overview?.repos ?? []
  const summary: OverviewSummary = {
    repos: repos.length,
    critical: 0,
    warning: 0,
    clean: 0,
    uncommitted: 0,
    unpushed: 0,
    behind: 0,
    ciFailing: 0,
    openPrs: 0,
    myPrs: 0,
    reviewRequests: 0,
    readyToMerge: 0,
    githubLoaded: repos.some(repo => repo.github !== null),
  }
  for (const repo of repos) {
    if (repo.severity === 'critical') summary.critical++
    else if (repo.severity === 'warning') summary.warning++
    else if (repo.severity === null) summary.clean++
    if (matchesFilter(repo, 'uncommitted')) summary.uncommitted++
    if (matchesFilter(repo, 'unpushed')) summary.unpushed++
    if (matchesFilter(repo, 'behind')) summary.behind++
    if (hasFailingCi(repo)) summary.ciFailing++
    for (const pull of repo.github?.pullRequests ?? []) {
      summary.openPrs++
      if (pull.mine) summary.myPrs++
      if (pull.reviewRequestedFromMe) summary.reviewRequests++
      if (pull.mine && !pull.draft && pull.reviewDecision === 'APPROVED' && pull.checks !== 'failure' && pull.mergeable !== 'CONFLICTING') summary.readyToMerge++
    }
  }
  return summary
}

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never'
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ]
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export const severityColor: Record<Severity, 'danger' | 'warning' | 'info'> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
}

export const checkColor: Record<CheckState, 'success' | 'danger' | 'warning' | 'neutral'> = {
  success: 'success',
  failure: 'danger',
  pending: 'warning',
  none: 'neutral',
}

export const checkLabel: Record<CheckState, string> = {
  success: 'Passing',
  failure: 'Failing',
  pending: 'Running',
  none: 'No checks',
}
