import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { RepoOverview, RepoStatus } from '../../shared/types/repo.ts'
import { computeAttention, highestSeverity } from './attention.ts'
import { collectGit, fetchRepo, githubSlug, isGitRepo } from './git.ts'
import { collectGithub, fetchViewer } from './github.ts'

const CONCURRENCY = 4

export function defaultRoots(): string[] {
  const configured = process.env.REPO_DASHBOARD_ROOTS
  if (configured) return configured.split(':').filter(Boolean).map(root => resolve(root))
  const workspace = join(homedir(), 'workspace')
  return [join(workspace, 'paqtdesign'), join(workspace, 'ricardoprins-paqt')]
}

export async function discoverRepos(roots: string[]): Promise<Array<{ root: string, path: string, name: string }>> {
  const found: Array<{ root: string, path: string, name: string }> = []
  for (const root of roots) {
    let entries
    try {
      entries = await readdir(root, { withFileTypes: true })
    }
    catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = join(root, entry.name)
      if (await isGitRepo(path)) found.push({ root, path, name: entry.name })
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index] as T)
    }
  }))
  return results
}

const message = (error: unknown) => (error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error))

export interface CollectOptions {
  roots?: string[]
  /** Run `git fetch --all --prune` in every repo first, so ahead/behind reflect the remote right now. */
  fetch?: boolean
  /** Skip the GitHub API calls and only report local git state. */
  github?: boolean
}

async function collectRepo(repo: { root: string, path: string, name: string }, options: CollectOptions, viewer: string | null): Promise<RepoStatus> {
  let gitError: string | null = null
  let githubError: string | null = null

  if (options.fetch) {
    try {
      await fetchRepo(repo.path)
    }
    catch (error) {
      gitError = `fetch failed: ${message(error)}`
    }
  }

  const gitInfo = await collectGit(repo.path).catch((error) => {
    gitError = message(error)
    return null
  })

  let github = null
  if (options.github === false) {
    githubError = 'GitHub data disabled'
  }
  else {
    const slug = githubSlug(gitInfo?.remoteUrl ?? null)
    if (!slug) {
      githubError = gitInfo?.remoteUrl ? 'Remote is not on github.com' : 'No remote configured'
    }
    else {
      github = await collectGithub(slug, gitInfo?.branch ?? null, viewer).catch((error) => {
        githubError = message(error)
        return null
      })
    }
  }

  const attention = computeAttention(gitInfo, github)
  if (gitError) attention.unshift({ severity: 'warning', code: 'git-error', message: gitError })

  return {
    name: basename(repo.path),
    path: repo.path,
    root: repo.root,
    git: gitInfo,
    github,
    githubError,
    gitError,
    attention,
    severity: highestSeverity(attention),
    collectedAt: new Date().toISOString(),
  }
}

export async function collectOverview(options: CollectOptions = {}): Promise<RepoOverview> {
  const roots = options.roots ?? defaultRoots()
  const repos = await discoverRepos(roots)
  const viewer = options.github === false ? null : await fetchViewer()
  const statuses = await pool(repos, CONCURRENCY, repo => collectRepo(repo, options, viewer))
  return {
    generatedAt: new Date().toISOString(),
    roots,
    viewer,
    fetched: options.fetch === true,
    repos: statuses,
  }
}
