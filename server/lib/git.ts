import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { BranchInfo, ChangedFile, CommitSummary, GitInfo, WorkingTreeInfo, WorktreeInfo } from '../../shared/types/repo.ts'
import { pool } from './pool.ts'

const execFileAsync = promisify(execFile)

const MAX_LISTED_FILES = 60
const MAX_LISTED_COMMITS = 8
const FIELD_SEPARATOR = '\u001F'
/** Worktrees of one repository collected at the same time. */
const WORKTREE_CONCURRENCY = 4

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
    const [name = '', upstream = '', track = '', date = '', head = '', worktreePath = ''] = line.split(FIELD_SEPARATOR)
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
      worktreePath: worktreePath || null,
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

export interface WorktreeEntry {
  path: string
  head: string | null
  branch: string | null
  detached: boolean
  bare: boolean
  prunable: boolean
}

/** Parses `git worktree list --porcelain`; the first entry is the main checkout. */
export function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  for (const block of output.split(/\n\n+/)) {
    const entry: WorktreeEntry = { path: '', head: null, branch: null, detached: false, bare: false, prunable: false }
    for (const line of block.split('\n')) {
      const [key = '', ...rest] = line.split(' ')
      const value = rest.join(' ')
      if (key === 'worktree') entry.path = value
      else if (key === 'HEAD') entry.head = value
      else if (key === 'branch') entry.branch = value.replace(/^refs\/heads\//, '')
      else if (key === 'detached') entry.detached = true
      else if (key === 'bare') entry.bare = true
      else if (key === 'prunable') entry.prunable = true
    }
    if (entry.path) entries.push(entry)
  }
  return entries
}

/** "Session 4" for a Claude session folder (~/workspace/lss-*-claude-workspace-4/<repo>), otherwise the path with ~ for home. */
export function worktreeLabel(path: string, home: string = homedir()): string {
  const session = /\/lss-[^/]*-claude-workspace-(\d+)\/[^/]+\/?$/.exec(path)
  if (session) return `Session ${session[1]}`
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
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

  const [branchOutput, stashOutput, lastCommitOutput, remoteUrl, fetchedAt, worktreeOutput] = await Promise.all([
    gitOrNull(cwd, ['for-each-ref', `--format=%(refname:short)%1f%(upstream:short)%1f%(upstream:track)%1f%(committerdate:iso-strict)%1f%(HEAD)%1f%(worktreepath)`, 'refs/heads']),
    gitOrNull(cwd, ['stash', 'list']),
    gitOrNull(cwd, ['log', '-1', `--format=${COMMIT_FORMAT}`]),
    gitOrNull(cwd, ['remote', 'get-url', 'origin']),
    lastFetchedAt(cwd),
    gitOrNull(cwd, ['worktree', 'list', '--porcelain']),
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

  const here = resolve(cwd)
  const linked = parseWorktreeList(worktreeOutput ?? '').slice(1).filter(entry => !entry.bare && resolve(entry.path) !== here)
  const worktrees = await pool(linked, WORKTREE_CONCURRENCY, entry => collectWorktree(entry, defaultBranch))

  return {
    branch: status.branch,
    detached: status.detached,
    headSha: status.headSha,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    defaultBranch,
    vsDefault: parseVsDefault(vsDefaultOutput),
    workingTree: status.workingTree,
    stashCount: (stashOutput ?? '').split('\n').filter(Boolean).length,
    lastCommit: parseCommits(lastCommitOutput ?? '')[0] ?? null,
    unpushed: parseCommits(unpushedOutput ?? ''),
    incoming: parseCommits(incomingOutput ?? ''),
    branches: parseBranches(branchOutput ?? '', merged),
    remoteUrl: remoteUrl?.trim() || null,
    lastFetchedAt: fetchedAt,
    worktrees,
  }
}

/** `rev-list --left-right --count origin/<default>...HEAD` output: behind, then ahead. */
function parseVsDefault(output: string | null): { ahead: number, behind: number } | null {
  const match = output ? /^(\d+)\s+(\d+)/.exec(output.trim()) : null
  return match ? { behind: Number(match[1]), ahead: Number(match[2]) } : null
}

/** The per-checkout part of collectGit for a linked worktree; refs, stashes and remotes are shared with the main checkout. */
export async function collectWorktree(entry: WorktreeEntry, defaultBranch: string | null): Promise<WorktreeInfo> {
  const info: WorktreeInfo = {
    path: entry.path,
    label: worktreeLabel(entry.path),
    missing: entry.prunable,
    branch: entry.branch,
    detached: entry.detached,
    headSha: entry.head,
    upstream: null,
    ahead: 0,
    behind: 0,
    vsDefault: null,
    orphanCommits: 0,
    workingTree: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, files: [], filesTruncated: false },
    lastCommit: null,
    unpushed: [],
    gitError: null,
    attention: [],
  }
  if (entry.prunable) return info

  const cwd = entry.path
  let status: ParsedStatus
  try {
    status = parseStatusV2(await git(cwd, ['status', '--porcelain=v2', '--branch']))
  }
  catch (error) {
    info.gitError = error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error)
    return info
  }

  const [lastCommitOutput, unpushedOutput, vsDefaultOutput, orphanOutput] = await Promise.all([
    gitOrNull(cwd, ['log', '-1', `--format=${COMMIT_FORMAT}`]),
    status.upstream
      ? gitOrNull(cwd, ['log', '@{upstream}..HEAD', `--format=${COMMIT_FORMAT}`, `-n${MAX_LISTED_COMMITS}`])
      : null,
    defaultBranch && status.branch !== defaultBranch
      ? gitOrNull(cwd, ['rev-list', '--left-right', '--count', `origin/${defaultBranch}...HEAD`])
      : null,
    status.detached
      ? gitOrNull(cwd, ['rev-list', '--count', 'HEAD', '--not', '--branches', '--remotes'])
      : null,
  ])

  return {
    ...info,
    branch: status.branch,
    detached: status.detached,
    headSha: status.headSha,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    vsDefault: parseVsDefault(vsDefaultOutput),
    orphanCommits: Number(orphanOutput?.trim() || 0),
    workingTree: status.workingTree,
    lastCommit: parseCommits(lastCommitOutput ?? '')[0] ?? null,
    unpushed: parseCommits(unpushedOutput ?? ''),
  }
}

/** Extracts `owner/repo` from a GitHub remote URL (https or ssh), or null for other hosts. */
export function githubSlug(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim())
  return match ? `${match[1]}/${match[2]}` : null
}
