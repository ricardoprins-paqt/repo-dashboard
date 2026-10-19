import type { AttentionItem, GitInfo, GithubInfo, Severity, WorktreeInfo } from '../../shared/types/repo.ts'

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : /(s|sh|ch|x)$/.test(word) ? `${word}es` : `${word}s`}`

type Add = (severity: Severity, code: string, message: string) => void
type Checkout = Pick<GitInfo, 'branch' | 'detached' | 'upstream' | 'ahead' | 'behind' | 'vsDefault' | 'workingTree'>

/** Rules for one checkout's own state: the main checkout and every linked worktree. */
function checkoutAttention(checkout: Checkout, defaultBranch: string | null, add: Add) {
  const tree = checkout.workingTree
  if (tree.conflicted > 0) add('critical', 'conflicts', `${plural(tree.conflicted, 'file')} with merge conflicts`)

  if (checkout.upstream && checkout.ahead > 0 && checkout.behind > 0) {
    add('critical', 'diverged', `Diverged from ${checkout.upstream}: ${checkout.ahead} ahead, ${checkout.behind} behind`)
  }
  else if (checkout.upstream && checkout.ahead > 0) {
    add('warning', 'unpushed', `${plural(checkout.ahead, 'commit')} not pushed to ${checkout.upstream}`)
  }
  else if (checkout.upstream && checkout.behind > 0) {
    add('warning', 'behind', `${plural(checkout.behind, 'commit')} behind ${checkout.upstream}, pull needed`)
  }
  if (!checkout.upstream && checkout.branch && !checkout.detached) {
    const extra = checkout.vsDefault && checkout.vsDefault.ahead > 0 ? ` (${plural(checkout.vsDefault.ahead, 'commit')} ahead of ${defaultBranch})` : ''
    add('warning', 'no-upstream', `Branch ${checkout.branch} is not pushed anywhere${extra}`)
  }

  const dirty = tree.staged + tree.unstaged
  if (dirty > 0) add('warning', 'dirty', `${plural(dirty, 'uncommitted change')} (${tree.staged} staged, ${tree.unstaged} unstaged)`)
  if (tree.untracked > 0) add('info', 'untracked', `${plural(tree.untracked, 'untracked path')}`)
}

/**
 * Findings for a linked worktree. A detached HEAD on its own is normal there (paqt-ws checks
 * out the default branch detached), so it only counts when it holds commits no branch has.
 */
export function computeWorktreeAttention(worktree: WorktreeInfo, defaultBranch: string | null): AttentionItem[] {
  const items: AttentionItem[] = []
  const add: Add = (severity, code, message) => items.push({ severity, code, message, worktree: worktree.label })

  if (worktree.missing) {
    add('info', 'worktree-missing', `Folder ${worktree.path} is gone, \`git worktree prune\` removes the entry`)
  }
  else if (worktree.gitError) {
    add('warning', 'git-error', worktree.gitError)
  }
  else {
    checkoutAttention(worktree, defaultBranch, add)
    if (worktree.orphanCommits > 0) {
      add('warning', 'detached', `${plural(worktree.orphanCommits, 'commit')} on a detached HEAD that no branch contains`)
    }
  }
  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

/**
 * Turns raw git and GitHub data into a ranked list of things worth a decision.
 * Pure function so the rules can be tested without touching a repository.
 * Linked worktrees contribute the findings in their own `attention`.
 */
export function computeAttention(git: GitInfo | null, github: GithubInfo | null): AttentionItem[] {
  const items: AttentionItem[] = []
  const add: Add = (severity, code, message) => items.push({ severity, code, message })

  if (git) {
    checkoutAttention(git, git.defaultBranch, add)
    if (git.detached) add('warning', 'detached', 'HEAD is detached, commits made here belong to no branch')
    if (git.stashCount > 0) add('info', 'stash', `${plural(git.stashCount, 'stash')} saved`)

    if (git.defaultBranch && git.branch && git.branch !== git.defaultBranch) {
      const behind = git.vsDefault?.behind ?? 0
      add('info', 'off-default', `On ${git.branch}, not ${git.defaultBranch}${behind > 0 ? ` (${behind} behind it)` : ''}`)
    }

    // Branches checked out in a worktree are covered by that worktree's own findings.
    const otherBranches = git.branches.filter(branch => !branch.current && !branch.worktreePath)
    const unpushedBranches = otherBranches.filter(branch => !branch.merged && (branch.ahead > 0 || (!branch.upstream && !branch.upstreamGone)))
    if (unpushedBranches.length > 0) {
      add('warning', 'unpushed-branches', `Local branches with unpushed work: ${unpushedBranches.map(branch => branch.name).join(', ')}`)
    }
    const cleanup = otherBranches.filter(branch => branch.merged || (branch.upstreamGone && branch.ahead === 0))
    if (cleanup.length > 0) {
      add('info', 'stale-branches', `${plural(cleanup.length, 'local branch')} can be deleted (merged or removed upstream)`)
    }

    for (const worktree of git.worktrees) items.push(...worktree.attention)
  }

  if (github) {
    for (const run of github.defaultBranchRuns) {
      if (run.state === 'failure') add('critical', 'ci-default-failing', `${run.workflow} is failing on ${github.defaultBranch}`)
    }
    for (const run of github.currentBranchRuns) {
      if (run.state === 'failure') add('warning', 'ci-branch-failing', `${run.workflow} is failing on ${run.branch}`)
    }

    const requested = github.pullRequests.filter(pull => pull.reviewRequestedFromMe)
    if (requested.length > 0) {
      add('warning', 'review-requested', `Review requested from you: ${requested.map(pull => `#${pull.number}`).join(', ')}`)
    }

    const mine = github.pullRequests.filter(pull => pull.mine)
    const failing = mine.filter(pull => pull.checks === 'failure')
    if (failing.length > 0) add('critical', 'pr-failing', `Your PRs with failing checks: ${failing.map(pull => `#${pull.number}`).join(', ')}`)
    const conflicting = mine.filter(pull => pull.mergeable === 'CONFLICTING')
    if (conflicting.length > 0) add('warning', 'pr-conflicting', `Your PRs with merge conflicts: ${conflicting.map(pull => `#${pull.number}`).join(', ')}`)
    const changes = mine.filter(pull => pull.reviewDecision === 'CHANGES_REQUESTED')
    if (changes.length > 0) add('warning', 'pr-changes', `Changes requested on your PRs: ${changes.map(pull => `#${pull.number}`).join(', ')}`)
    const ready = mine.filter(pull => !pull.draft && pull.reviewDecision === 'APPROVED' && pull.checks !== 'failure' && pull.mergeable !== 'CONFLICTING')
    if (ready.length > 0) add('info', 'pr-ready', `Approved and ready to merge: ${ready.map(pull => `#${pull.number}`).join(', ')}`)

    if (github.archived) add('info', 'archived', 'Repository is archived on GitHub')
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

export function highestSeverity(items: AttentionItem[]): Severity | null {
  return items[0]?.severity ?? null
}
