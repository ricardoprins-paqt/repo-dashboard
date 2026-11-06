import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CiRun, CiSyncState } from '#shared/types/ci'
import { isCiRun, toCiRun, type RawActionsRun } from './ci.ts'
import { ciStore, type CiStore, type StoredRepo } from './ci-store.ts'
import { pool } from './pool.ts'

const execFileAsync = promisify(execFile)

export const ciOrg = () => process.env.REPO_DASHBOARD_CI_ORG || 'paqtcom'
export const SYNC_INTERVAL_MS = 60 * 60 * 1000
/** A repo without runs is looked at again when it was pushed to, or after a day (scheduled workflows need no push). */
const NO_RUNS_RECHECK_MS = 24 * 60 * 60 * 1000
const FIRST_SYNC_PAGES = 3
const MAX_GAP_PAGES = 5
/** Stop when fewer calls than this are left in the hour, so the rest of the dashboard keeps working. */
const RATE_LIMIT_RESERVE = 1000

export class GhError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.status = status
  }
}

/**
 * The machine's own `gh` login, which has SSO access to the organisation. A GITHUB_TOKEN or GH_TOKEN in the server's environment
 * (for installing packages, say) would win over it in gh and usually sees only the public repos.
 */
function ghEnv(): NodeJS.ProcessEnv {
  const { GITHUB_TOKEN: _github, GH_TOKEN: _gh, ...env } = process.env
  return { ...env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' }
}

/** `gh api <path>` with the machine's own login. The token stays in gh; nothing here sees it. */
export async function ghApi<T>(path: string, options: { raw?: boolean, accept?: string, escapes?: boolean } = {}): Promise<T> {
  const args = ['api', path]
  if (options.accept) args.push('-H', `Accept: ${options.accept}`)
  // Job logs carry colour codes, which gh refuses to print without this (the caller strips them).
  if (options.escapes) args.push('--allow-escape-sequences')
  try {
    const { stdout } = await execFileAsync('gh', args, {
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
      env: ghEnv(),
    })
    return (options.raw ? stdout : JSON.parse(stdout)) as T
  }
  catch (caught) {
    const stderr = String((caught as { stderr?: string }).stderr ?? (caught as Error).message)
    const status = Number(stderr.match(/HTTP (\d{3})/)?.[1]) || null
    throw new GhError(stderr.trim().split('\n')[0] ?? 'gh failed', status)
  }
}

interface RawOrgRepo {
  name: string
  default_branch: string
  html_url: string
  archived: boolean
  pushed_at: string | null
}

interface RunsPage {
  total_count: number
  workflow_runs: RawActionsRun[]
}

/** Why a repo cannot be read, in words, for the "no access" list. */
export function describeAccessError(error: GhError): string {
  if (/SAML|SSO/i.test(error.message)) return 'Needs SSO authorisation for this organisation'
  if (error.status === 404) return 'Not found with this login (no access to its Actions)'
  if (error.status === 403) return 'No permission to read its Actions'
  return error.message
}

/** Fetches what is new for one repo and stores it; a repo that cannot be read is stored as "no access". */
export async function syncRepo(store: CiStore, org: string, repo: RawOrgRepo, now = Date.now()): Promise<void> {
  const stored = store.repo(repo.name)
  const base: StoredRepo = {
    name: repo.name,
    defaultBranch: repo.default_branch,
    url: repo.html_url,
    access: 'ok',
    error: null,
    pushedAt: repo.pushed_at,
    hasRuns: stored?.hasRuns ?? false,
    checkedAt: new Date(now).toISOString(),
  }
  const quiet = stored && stored.access === 'ok' && !stored.hasRuns && stored.pushedAt === repo.pushed_at
    && stored.defaultBranch === repo.default_branch && stored.checkedAt && now - Date.parse(stored.checkedAt) < NO_RUNS_RECHECK_MS
  if (quiet) return

  const newest = store.newestRunId(repo.name)
  const perPage = newest === null ? 100 : 30
  const branch = encodeURIComponent(repo.default_branch)
  const page = (n: number) => ghApi<RunsPage>(`repos/${org}/${repo.name}/actions/runs?branch=${branch}&per_page=${perPage}&page=${n}&exclude_pull_requests=true`)

  let first: RunsPage
  try {
    first = await page(1)
  }
  catch (caught) {
    if (caught instanceof GhError && (caught.status === 403 || caught.status === 404)) {
      store.saveRepo({ ...base, access: 'none', error: describeAccessError(caught) })
      return
    }
    throw caught
  }

  const fetched: RawActionsRun[] = [...first.workflow_runs]
  // First time: some history. Later: keep going while the page does not reach what is stored yet (more than 30 runs in an hour).
  const morePages = newest === null ? FIRST_SYNC_PAGES : MAX_GAP_PAGES
  for (let n = 2, last = first.workflow_runs; n <= morePages && last.length === perPage; n++) {
    if (newest !== null && last.some(run => run.id <= newest)) break
    last = (await page(n)).workflow_runs
    fetched.push(...last)
  }

  const runs: CiRun[] = fetched.filter(isCiRun).map(run => toCiRun(repo.name, run))
  // Runs that were still going at the last sync and have dropped off the page.
  const seen = new Set(runs.map(run => run.id))
  for (const id of store.unfinishedRuns(repo.name).filter(id => !seen.has(id)).slice(0, 10)) {
    try {
      runs.push(toCiRun(repo.name, await ghApi<RawActionsRun>(`repos/${org}/${repo.name}/actions/runs/${id}`)))
    }
    catch {
      // Deleted runs stay as they were.
    }
  }
  store.upsertRuns(runs)
  store.saveRepo({ ...base, hasRuns: base.hasRuns || runs.length > 0 || first.total_count > 0 })
}

interface SyncRuntime extends CiSyncState {
  promise: Promise<void> | null
}

// Survives hot reloads in dev, so a reload never starts a second sync.
const runtime: SyncRuntime = ((globalThis as { __ciSync?: SyncRuntime }).__ciSync ??= {
  running: false, lastSyncedAt: null, nextSyncAt: null, lastError: null, done: 0, total: 0, promise: null,
})

export function syncState(store: CiStore = ciStore()): CiSyncState {
  const lastSyncedAt = store.getMeta('lastSyncedAt')
  return {
    running: runtime.running,
    lastSyncedAt,
    nextSyncAt: lastSyncedAt ? new Date(Date.parse(lastSyncedAt) + SYNC_INTERVAL_MS).toISOString() : null,
    lastError: store.getMeta('lastError'),
    done: runtime.done,
    total: runtime.total,
  }
}

async function runSync(store: CiStore) {
  const org = ciOrg()
  const rate = await ghApi<{ resources: { core: { remaining: number, reset: number } } }>('rate_limit')
  if (rate.resources.core.remaining < RATE_LIMIT_RESERVE) {
    throw new Error(`GitHub rate limit nearly used (${rate.resources.core.remaining} calls left); trying again after ${new Date(rate.resources.core.reset * 1000).toLocaleTimeString('en-GB')}`)
  }
  const all: RawOrgRepo[] = []
  for (let n = 1; ; n++) {
    const list = await ghApi<RawOrgRepo[]>(`orgs/${org}/repos?per_page=100&type=all&page=${n}`)
    all.push(...list)
    if (list.length < 100) break
  }
  const active = all.filter(repo => !repo.archived)
  store.forgetArchived(all.filter(repo => repo.archived).map(repo => repo.name))
  // A repo that is no longer listed keeps its history: a login that suddenly sees less must not wipe it.
  const listed = new Set(active.map(repo => repo.name))
  for (const repo of store.repos().filter(repo => !listed.has(repo.name) && repo.access === 'ok')) {
    store.saveRepo({ ...repo, access: 'none', error: 'No longer listed in the organisation for this login', checkedAt: new Date().toISOString() })
  }

  runtime.total = active.length
  runtime.done = 0
  const errors: string[] = []
  await pool(active, 4, async (repo) => {
    try {
      await syncRepo(store, org, repo)
    }
    catch (caught) {
      errors.push(`${repo.name}: ${(caught as Error).message}`)
    }
    runtime.done++
  })
  store.setMeta('lastSyncedAt', new Date().toISOString())
  store.setMeta('lastError', errors.length ? `${errors.length} repos failed to sync. ${errors.slice(0, 3).join('; ')}` : null)
}

/** Starts a sync unless one is running; resolves when it is done. */
export function syncNow(store: CiStore = ciStore()): Promise<void> {
  if (runtime.promise) return runtime.promise
  runtime.running = true
  runtime.promise = runSync(store)
    .catch((caught) => {
      store.setMeta('lastSyncedAt', new Date().toISOString())
      store.setMeta('lastError', (caught as Error).message)
    })
    .finally(() => {
      runtime.running = false
      runtime.promise = null
    })
  return runtime.promise
}

/** True when the last sync is an hour old (or there never was one). */
export function syncDue(store: CiStore = ciStore(), now = Date.now()): boolean {
  const last = store.getMeta('lastSyncedAt')
  return !last || now - Date.parse(last) >= SYNC_INTERVAL_MS
}
