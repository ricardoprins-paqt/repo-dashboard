import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { BranchInfo, ChangedFile, CommitSummary, GitInfo, WorkingTreeInfo } from '../../shared/types/repo.ts'

const execFileAsync = promisify(execFile)

const MAX_LISTED_FILES = 60
const MAX_LISTED_COMMITS = 8
const FIELD_SEPARATOR = '\u001F'

const gitEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  // Never take the index lock: this tool only reads, and must not disturb running git commands.
  GIT_OPTIONAL_LOCKS: '0',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
  LC_ALL: 'C',
}

export async function git(cwd: string, args: string[], timeout = 20_000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    env: gitEnv,
  })
  return stdout
}

async function gitOrNull(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args)
  }
  catch {
    return null
  }
}

export async function fetchRepo(cwd: string): Promise<void> {
  await git(cwd, ['fetch', '--all', '--prune', '--quiet'], 60_000)
}

export interface ParsedStatus {
  branch: string | null
  detached: boolean
  headSha: string | null
  upstream: string | null
  ahead: number
  behind: number
  workingTree: WorkingTreeInfo
}

/** Parses `git status --porcelain=v2 --branch` output. */
export function parseStatusV2(output: string): ParsedStatus {
  const result: ParsedStatus = {
    branch: null,
    detached: false,
    headSha: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    workingTree: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, files: [], filesTruncated: false },
  }
  const tree = result.workingTree
  const addFile = (file: ChangedFile) => {
    if (tree.files.length < MAX_LISTED_FILES) tree.files.push(file)
    else tree.filesTruncated = true
  }

  for (const line of output.split('\n')) {
    if (!line) continue

    if (line.startsWith('# ')) {
      const [, key, ...rest] = line.split(' ')
      const value = rest.join(' ')
      if (key === 'branch.oid') result.headSha = value === '(initial)' ? null : value
      else if (key === 'branch.head') {
        result.detached = value === '(detached)'
        result.branch = result.detached ? null : value
      }
      else if (key === 'branch.upstream') result.upstream = value
      else if (key === 'branch.ab') {
        const match = /^\+(\d+) -(\d+)$/.exec(value)
        if (match) {
          result.ahead = Number(match[1])
          result.behind = Number(match[2])
        }
      }
      continue
    }

    if (line.startsWith('? ')) {
      tree.untracked++
      addFile({ path: line.slice(2), index: '.', worktree: '?', kind: 'untracked' })
      continue
    }

    if (line.startsWith('u ')) {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path
      const fields = line.split(' ')
      tree.conflicted++
      addFile({ path: fields.slice(10).join(' '), index: fields[1]?.[0] ?? 'U', worktree: fields[1]?.[1] ?? 'U', kind: 'conflicted' })
      continue
    }

    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // 1 XY sub mH mI mW hH hI path
      // 2 XY sub mH mI mW hH hI Xscore path<TAB>origPath
      const isRename = line.startsWith('2 ')
      const fields = line.split(' ')
      const xy = fields[1] ?? '..'
      const index = xy[0] ?? '.'
      const worktree = xy[1] ?? '.'
      const rawPath = fields.slice(isRename ? 9 : 8).join(' ')
      const path = isRename ? rawPath.split('\t')[0] ?? rawPath : rawPath
      if (index !== '.') {
        tree.staged++
        addFile({ path, index, worktree, kind: 'staged' })
      }
      if (worktree !== '.') {
        tree.unstaged++
        // A path that is both staged and modified again is listed once, as staged.
        if (index === '.') addFile({ path, index, worktree, kind: 'unstaged' })
      }
    }
  }

  return result
}

/** Parses the `%(upstream:track)` format, e.g. `[ahead 1, behind 2]` or `[gone]`. */
export function parseTrack(track: string): { ahead: number, behind: number, gone: boolean } {
  return {
    ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
    gone: track.includes('gone'),
  }
}

export function parseBranches(output: string, mergedNames: Set<string>): BranchInfo[] {
  const branches: BranchInfo[] = []
  for (const line of output.split('\n')) {
    if (!line) continue
    const [name = '', upstream = '', track = '', date = '', head = ''] = line.split(FIELD_SEPARATOR)
    const { ahead, behind, gone } = parseTrack(track)
    branches.push({
      name,
      current: head === '*',
      upstream: upstream || null,
      upstreamGone: gone,
      ahead,
      behind,
      merged: mergedNames.has(name),
      lastCommitDate: date,
    })
  }
  return branches
}

export function parseCommits(output: string): CommitSummary[] {
  const commits: CommitSummary[] = []
  for (const line of output.split('\n')) {
    if (!line) continue
    const [hash = '', author = '', date = '', ...subject] = line.split(FIELD_SEPARATOR)
    commits.push({ hash, author, date, subject: subject.join(FIELD_SEPARATOR) })
  }
  return commits
}

const COMMIT_FORMAT = ['%h', '%an', '%aI', '%s'].join('%x1f')

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    await stat(join(path, '.git'))
    return true
  }
  catch {
    return false
  }
}

async function resolveDefaultBranch(cwd: string, branchNames: string[]): Promise<string | null> {
  const head = await gitOrNull(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (head?.trim()) return head.trim().replace(/^origin\//, '')
  for (const candidate of ['main', 'master', 'develop']) {
    if (branchNames.includes(candidate)) return candidate
  }
  return null
}

async function lastFetchedAt(cwd: string): Promise<string | null> {
  const gitDir = (await gitOrNull(cwd, ['rev-parse', '--git-common-dir']))?.trim()
  if (!gitDir) return null
  try {
    const info = await stat(join(cwd, gitDir, 'FETCH_HEAD'))
    return info.mtime.toISOString()
  }
  catch {
    return null
  }
}

export async function collectGit(cwd: string): Promise<GitInfo> {
  const statusOutput = await git(cwd, ['status', '--porcelain=v2', '--branch'])
  const status = parseStatusV2(statusOutput)

  const [branchOutput, stashOutput, lastCommitOutput, remoteUrl, fetchedAt] = await Promise.all([
    gitOrNull(cwd, ['for-each-ref', `--format=%(refname:short)%1f%(upstream:short)%1f%(upstream:track)%1f%(committerdate:iso-strict)%1f%(HEAD)`, 'refs/heads']),
    gitOrNull(cwd, ['stash', 'list']),
    gitOrNull(cwd, ['log', '-1', `--format=${COMMIT_FORMAT}`]),
    gitOrNull(cwd, ['remote', 'get-url', 'origin']),
    lastFetchedAt(cwd),
  ])

  const branchNames = (branchOutput ?? '').split('\n').filter(Boolean).map(line => line.split(FIELD_SEPARATOR)[0] ?? '')
  const defaultBranch = await resolveDefaultBranch(cwd, branchNames)

  const mergedOutput = defaultBranch
    ? await gitOrNull(cwd, ['branch', '--merged', defaultBranch, '--format=%(refname:short)'])
    : null
  const merged = new Set((mergedOutput ?? '').split('\n').filter(Boolean))
  if (defaultBranch) merged.delete(defaultBranch)

  const [unpushedOutput, incomingOutput, vsDefaultOutput] = await Promise.all([
    status.upstream
      ? gitOrNull(cwd, ['log', '@{upstream}..HEAD', `--format=${COMMIT_FORMAT}`, `-n${MAX_LISTED_COMMITS}`])
      : null,
    status.upstream
      ? gitOrNull(cwd, ['log', 'HEAD..@{upstream}', `--format=${COMMIT_FORMAT}`, `-n${MAX_LISTED_COMMITS}`])
      : null,
    defaultBranch && status.branch !== defaultBranch
      ? gitOrNull(cwd, ['rev-list', '--left-right', '--count', `origin/${defaultBranch}...HEAD`])
      : null,
  ])

  const vsDefaultMatch = vsDefaultOutput ? /^(\d+)\s+(\d+)/.exec(vsDefaultOutput.trim()) : null

  return {
    branch: status.branch,
    detached: status.detached,
    headSha: status.headSha,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    defaultBranch,
    vsDefault: vsDefaultMatch ? { behind: Number(vsDefaultMatch[1]), ahead: Number(vsDefaultMatch[2]) } : null,
    workingTree: status.workingTree,
    stashCount: (stashOutput ?? '').split('\n').filter(Boolean).length,
    lastCommit: parseCommits(lastCommitOutput ?? '')[0] ?? null,
    unpushed: parseCommits(unpushedOutput ?? ''),
    incoming: parseCommits(incomingOutput ?? ''),
    branches: parseBranches(branchOutput ?? '', merged),
    remoteUrl: remoteUrl?.trim() || null,
    lastFetchedAt: fetchedAt,
  }
}

/** Extracts `owner/repo` from a GitHub remote URL (https or ssh), or null for other hosts. */
export function githubSlug(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim())
  return match ? `${match[1]}/${match[2]}` : null
}
