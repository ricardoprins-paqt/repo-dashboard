#!/usr/bin/env node
import { collectOverview } from '../server/lib/collect.ts'
import type { RepoStatus } from '../shared/types/repo.ts'

const args = process.argv.slice(2)
const flags = new Set(args.filter(arg => arg.startsWith('--')))
const roots = args.filter(arg => !arg.startsWith('--'))

if (flags.has('--help')) {
  console.log(`Usage: repos-status [--fetch] [--no-github] [--json] [root ...]

Prints the git and GitHub status of every repository directly inside the given
root folders (default: $REPO_DASHBOARD_ROOTS, or ~/workspace/paqtdesign and ~/workspace/ricardoprins-paqt).

  --fetch       git fetch --all --prune in every repo first
  --no-github   local git state only
  --json        machine readable output`)
  process.exit(0)
}

const overview = await collectOverview({
  ...(roots.length > 0 ? { roots } : {}),
  fetch: flags.has('--fetch'),
  github: !flags.has('--no-github'),
})

if (flags.has('--json')) {
  console.log(JSON.stringify(overview, null, 2))
  process.exit(0)
}

const icon = { critical: '✖', warning: '▲', info: '·' } as const
const describe = (repo: RepoStatus) => {
  const git = repo.git
  if (!git) return `${repo.name}  (git error: ${repo.gitError})`
  const sync = git.upstream ? `↑${git.ahead} ↓${git.behind}` : 'no upstream'
  const tree = git.workingTree
  const prs = repo.github ? `${repo.github.pullRequests.length} PR` : '-'
  return `${repo.name.padEnd(34)} ${(git.branch ?? 'detached').padEnd(32)} ${sync.padEnd(12)} +${tree.staged} ~${tree.unstaged} ?${tree.untracked}  stash:${git.stashCount}  ${prs}`
}

for (const repo of overview.repos) {
  console.log(`${repo.severity ? icon[repo.severity] : '✔'} ${describe(repo)}`)
  for (const worktree of repo.git?.worktrees ?? []) {
    const tree = worktree.workingTree
    console.log(`    ⎇ ${worktree.label.padEnd(12)} ${(worktree.branch ?? 'detached').padEnd(32)} ${(worktree.upstream ? `↑${worktree.ahead} ↓${worktree.behind}` : worktree.detached ? '' : 'no upstream').padEnd(12)}  +${tree.staged} ~${tree.unstaged} ?${tree.untracked}`)
  }
  for (const item of repo.attention) console.log(`    ${icon[item.severity]} ${item.worktree ? `${item.worktree}: ` : ''}${item.message}`)
}
