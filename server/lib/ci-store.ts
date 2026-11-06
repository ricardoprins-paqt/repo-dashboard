import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { CiExplanation, CiRepoInfo, CiRun } from '#shared/types/ci'
import { runState } from './github.ts'

/**
 * The CI page's own history: every default-branch run the sync has seen, the repos it checked and the AI explanations.
 * Kept in SQLite (Node's built-in driver) so the history outlives GitHub's view and the page loads without calling GitHub.
 */
export function defaultCiDbPath(): string {
  const state = process.env.XDG_STATE_HOME || join(homedir(), '.local/state')
  return process.env.REPO_DASHBOARD_CI_DB || join(state, 'repo-dashboard', 'ci.sqlite')
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  repo TEXT NOT NULL,
  workflow_id INTEGER NOT NULL,
  workflow TEXT NOT NULL,
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  conclusion TEXT,
  sha TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  duration_s INTEGER,
  url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_repo ON runs (repo, workflow_id, created_at DESC);
CREATE TABLE IF NOT EXISTS repos (
  name TEXT PRIMARY KEY,
  default_branch TEXT NOT NULL,
  url TEXT NOT NULL,
  access TEXT NOT NULL,
  error TEXT,
  pushed_at TEXT,
  has_runs INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT
);
CREATE TABLE IF NOT EXISTS explanations (
  run_id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`

interface RunRow {
  id: number
  repo: string
  workflow_id: number
  workflow: string
  path: string
  branch: string
  event: string
  status: string
  conclusion: string | null
  sha: string
  title: string
  author: string
  attempt: number
  created_at: string
  started_at: string
  updated_at: string
  duration_s: number | null
  url: string
}

interface RepoRow {
  name: string
  default_branch: string
  url: string
  access: string
  error: string | null
  pushed_at: string | null
  has_runs: number
  checked_at: string | null
}

const toRun = (row: RunRow): CiRun => ({
  id: row.id,
  repo: row.repo,
  workflowId: row.workflow_id,
  workflow: row.workflow,
  path: row.path,
  branch: row.branch,
  event: row.event,
  status: row.status,
  conclusion: row.conclusion,
  state: runState(row.status, row.conclusion),
  sha: row.sha,
  title: row.title,
  author: row.author,
  attempt: row.attempt,
  createdAt: row.created_at,
  startedAt: row.started_at,
  updatedAt: row.updated_at,
  durationS: row.duration_s,
  url: row.url,
})

export interface StoredRepo extends CiRepoInfo {
  pushedAt: string | null
  hasRuns: boolean
}

const toRepo = (row: RepoRow): StoredRepo => ({
  name: row.name,
  defaultBranch: row.default_branch,
  url: row.url,
  access: row.access === 'none' ? 'none' : 'ok',
  error: row.error,
  checkedAt: row.checked_at,
  pushedAt: row.pushed_at,
  hasRuns: row.has_runs === 1,
})

export class CiStore {
  readonly db: DatabaseSync

  constructor(path: string = defaultCiDbPath()) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
    this.db.exec(SCHEMA)
  }

  upsertRuns(runs: CiRun[]) {
    const insert = this.db.prepare(`
      INSERT INTO runs (id, repo, workflow_id, workflow, path, branch, event, status, conclusion, sha, title, author, attempt,
        created_at, started_at, updated_at, duration_s, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET workflow = excluded.workflow, status = excluded.status, conclusion = excluded.conclusion,
        attempt = excluded.attempt, started_at = excluded.started_at, updated_at = excluded.updated_at,
        duration_s = excluded.duration_s`)
    this.db.exec('BEGIN')
    try {
      for (const r of runs) {
        insert.run(r.id, r.repo, r.workflowId, r.workflow, r.path, r.branch, r.event, r.status, r.conclusion, r.sha, r.title, r.author,
          r.attempt, r.createdAt, r.startedAt, r.updatedAt, r.durationS, r.url)
      }
      this.db.exec('COMMIT')
    }
    catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /** The newest runs per repo × workflow (at most `perWorkflow` each), across all repos or one. */
  recentRuns(perWorkflow: number, repo?: string): CiRun[] {
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY repo, workflow_id ORDER BY created_at DESC, id DESC) AS n FROM runs
        ${repo ? 'WHERE repo = ?' : ''}
      ) WHERE n <= ? ORDER BY created_at DESC`).all(...(repo ? [repo, perWorkflow] : [perWorkflow])) as unknown as RunRow[]
    return rows.map(toRun)
  }

  runsOf(repo: string, limit: number): CiRun[] {
    return (this.db.prepare('SELECT * FROM runs WHERE repo = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(repo, limit) as unknown as RunRow[]).map(toRun)
  }

  run(id: number): CiRun | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined
    return row ? toRun(row) : null
  }

  /** The highest run id stored for a repo (ids only grow), to know whether a page from GitHub reaches what we have. */
  newestRunId(repo: string): number | null {
    const row = this.db.prepare('SELECT MAX(id) AS id FROM runs WHERE repo = ?').get(repo) as { id: number | null }
    return row.id
  }

  /** Runs still queued or running, which the next sync has to look at again. */
  unfinishedRuns(repo: string): number[] {
    return (this.db.prepare(`SELECT id FROM runs WHERE repo = ? AND status != 'completed'`).all(repo) as Array<{ id: number }>).map(row => row.id)
  }

  saveRepo(repo: StoredRepo) {
    this.db.prepare(`
      INSERT INTO repos (name, default_branch, url, access, error, pushed_at, has_runs, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET default_branch = excluded.default_branch, url = excluded.url, access = excluded.access,
        error = excluded.error, pushed_at = excluded.pushed_at, has_runs = excluded.has_runs, checked_at = excluded.checked_at`)
      .run(repo.name, repo.defaultBranch, repo.url, repo.access, repo.error, repo.pushedAt, repo.hasRuns ? 1 : 0, repo.checkedAt)
  }

  repo(name: string): StoredRepo | null {
    const row = this.db.prepare('SELECT * FROM repos WHERE name = ?').get(name) as RepoRow | undefined
    return row ? toRepo(row) : null
  }

  repos(): StoredRepo[] {
    return (this.db.prepare('SELECT * FROM repos ORDER BY name').all() as unknown as RepoRow[]).map(toRepo)
  }

  /** Repos that left the org or were archived: their runs no longer show. */
  removeReposExcept(names: string[]) {
    const keep = new Set(names)
    for (const repo of this.repos()) {
      if (keep.has(repo.name)) continue
      this.db.prepare('DELETE FROM repos WHERE name = ?').run(repo.name)
      this.db.prepare('DELETE FROM runs WHERE repo = ?').run(repo.name)
    }
  }

  explanation(runId: number): CiExplanation | null {
    const row = this.db.prepare('SELECT json FROM explanations WHERE run_id = ?').get(runId) as { json: string } | undefined
    return row ? JSON.parse(row.json) as CiExplanation : null
  }

  saveExplanation(explanation: CiExplanation) {
    this.db.prepare('INSERT OR REPLACE INTO explanations (run_id, created_at, json) VALUES (?, ?, ?)')
      .run(explanation.runId, explanation.createdAt, JSON.stringify(explanation))
  }

  explainedRunIds(): number[] {
    return (this.db.prepare('SELECT run_id FROM explanations').all() as Array<{ run_id: number }>).map(row => row.run_id)
  }

  getMeta(key: string): string | null {
    return (this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string | null } | undefined)?.value ?? null
  }

  setMeta(key: string, value: string | null) {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value)
  }
}

let shared: CiStore | undefined

/** One store for the whole server process. */
export function ciStore(): CiStore {
  shared ??= new CiStore()
  return shared
}
