import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CiExplanation, CiFailureKind, CiRun } from '#shared/types/ci'
import { byNewest } from './ci.ts'
import type { CiStore } from './ci-store.ts'
import { ciOrg, ghApi } from './ci-sync.ts'

/**
 * "Why did this fail?": collects the failing step's log (trimmed), the workflow file and the commit, strips anything that looks
 * like a secret, and asks the local Claude Code CLI with every tool turned off: text in, text out.
 */

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted private key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[redacted]'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, '[redacted]'],
  [/\bnpm_[A-Za-z0-9]{30,}/g, '[redacted]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[redacted]'],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, '[redacted]'],
  [/\b[sprk]k_(?:live|test)_[A-Za-z0-9]{10,}/g, '[redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted jwt]'],
  // user:password@ in URLs
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, '$1[redacted]@'],
  [/\b(authorization:\s*(?:bearer|basic|token)\s+)\S+/gi, '$1[redacted]'],
  [/\b(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[redacted]'],
  // password=..., API_KEY: ..., "client_secret": "..."
  [/\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)[A-Za-z0-9_.-]*["']?\s*[=:]\s*)(["']?)([^\s"',;]{6,})\2/gi, '$1$2[redacted]$2'],
]

/** Long strings mixing upper case, lower case and several digits look like keys; hashes in plain hex stay (commit ids). */
const HIGH_ENTROPY = /[A-Za-z0-9+=_-]{32,}/g
const looksRandom = (word: string) => /[A-Z]/.test(word) && /[a-z]/.test(word) && (word.match(/\d/g)?.length ?? 0) >= 3

export function redactSecrets(text: string): string {
  let result = text
  for (const [pattern, replacement] of SECRET_PATTERNS) result = result.replace(pattern, replacement)
  return result.replace(HIGH_ENTROPY, word => (looksRandom(word) ? '[redacted]' : word))
}

const TIMESTAMP = /^\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?/
// eslint-disable-next-line no-control-regex
const ESCAPES = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)|[@-Z\\-_])/g
const MAX_LINE = 400

/**
 * The part of a job log that matters: from the start of the step that failed (`##[group]Run ...`) or up to `before` lines above
 * the first `##[error]`, to a few lines after the last one. Without an error marker, the end of the log.
 */
export function trimLog(log: string, before = 250, maxLines = 400): string {
  const lines = log.replace(ESCAPES, '').split(/\r?\n/).map(line => line.replace(TIMESTAMP, '')).map(line => (line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)} …` : line))
  while (lines.length && lines.at(-1) === '') lines.pop()
  const errors = lines.flatMap((line, i) => (line.includes('##[error]') ? [i] : []))
  let excerpt: string[]
  let start: number
  if (errors.length === 0) {
    start = Math.max(0, lines.length - maxLines)
    excerpt = lines.slice(start)
  }
  else {
    const first = errors[0]!
    let stepStart = 0
    for (let i = first; i >= 0; i--) {
      if (lines[i]!.startsWith('##[group]Run ')) {
        stepStart = i
        break
      }
    }
    start = Math.max(stepStart, first - before)
    excerpt = lines.slice(start, Math.min(lines.length, errors.at(-1)! + 20))
  }
  if (excerpt.length > maxLines) {
    const head = 40
    excerpt = [...excerpt.slice(0, head), `… (${excerpt.length - maxLines} lines left out) …`, ...excerpt.slice(excerpt.length - (maxLines - head))]
  }
  return (start > 0 ? `… (${start} earlier lines left out)\n` : '') + excerpt.join('\n')
}

interface RawJob {
  id: number
  name: string
  conclusion: string | null
  steps?: Array<{ name: string, number: number, conclusion: string | null }>
}

const FAILED = ['failure', 'timed_out', 'startup_failure']
const MAX_JOBS = 3

export interface FailureContext {
  run: CiRun
  jobs: Array<{ name: string, failedSteps: string[], log: string }>
  workflowFile: string | null
  commit: { message: string, files: string[] } | null
  history: CiRun[]
}

export async function collectContext(store: CiStore, run: CiRun, org = ciOrg()): Promise<FailureContext> {
  const repo = `repos/${org}/${run.repo}`
  const { jobs } = await ghApi<{ jobs: RawJob[] }>(`${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`)
  const failed = jobs.filter(job => FAILED.includes(job.conclusion ?? '')).slice(0, MAX_JOBS)
  const jobContexts = await Promise.all(failed.map(async job => ({
    name: job.name,
    failedSteps: (job.steps ?? []).filter(step => FAILED.includes(step.conclusion ?? '')).map(step => step.name),
    log: await ghApi<string>(`${repo}/actions/jobs/${job.id}/logs`, { raw: true, escapes: true })
      .then(log => trimLog(log, failed.length > 1 ? 150 : 250))
      .catch(() => '(log not available)'),
  })))

  const workflowFile = run.path.startsWith('.github/')
    ? await ghApi<string>(`${repo}/contents/${run.path}?ref=${run.sha}`, { raw: true, accept: 'application/vnd.github.raw' })
        .then(text => text.split('\n').slice(0, 400).join('\n'))
        .catch(() => null)
    : null

  const commit = await ghApi<{ commit: { message: string }, files?: Array<{ filename: string, status: string }> }>(`${repo}/commits/${run.sha}`)
    .then(c => ({ message: c.commit.message.slice(0, 2000), files: (c.files ?? []).slice(0, 60).map(f => `${f.status} ${f.filename}`) }))
    .catch(() => null)

  const history = store.runsOf(run.repo, 400)
    .filter(other => other.workflowId === run.workflowId && other.createdAt <= run.createdAt && other.id !== run.id)
    .sort(byNewest)
    .slice(0, 10)

  return { run, jobs: jobContexts, workflowFile, commit, history }
}

export const SYSTEM_PROMPT = `You explain why a GitHub Actions run on a repository's default branch failed, for the developers of that project.
You get: the failing jobs with the log of the failing step (trimmed), the workflow file, the commit, and the earlier runs of the same workflow.
Use only this material; say so when it is not enough. Be concrete and short: name files, tests, commands and error messages.
Answer with only one JSON object, no other text:
{"failed": "which job, step and test or command failed",
 "cause": "the likely cause, two to four sentences",
 "kind": "code" | "flaky" | "ci-setup" | "base-red" | "unknown",
 "fix": "the proposed fix, as short steps",
 "confidence": "high" | "medium" | "low",
 "confidenceReason": "one sentence: why this confidence"}
kind: code = the commit's own change broke it; flaky = a test or step that fails at random (timing, network); ci-setup = the runner,
the workflow, secrets, dependencies or a service outside the code; base-red = it was already failing in the earlier runs before this
commit, for the same reason.`

export function buildPrompt(context: FailureContext): string {
  const { run } = context
  const parts = [
    `Repository: ${run.repo} (default branch ${run.branch})`,
    `Workflow: ${run.workflow} (${run.path}), run ${run.id}, attempt ${run.attempt}, event ${run.event}, conclusion ${run.conclusion}`,
    `Commit: ${run.sha.slice(0, 10)} by ${run.author}`,
    context.commit ? `Commit message:\n${context.commit.message}\n\nChanged files:\n${context.commit.files.join('\n') || '(none listed)'}` : 'Commit details: not available',
    `Earlier runs of this workflow on ${run.branch}, newest first:\n${context.history.map(h => `- ${h.createdAt} ${h.conclusion ?? h.status} ${h.sha.slice(0, 10)} ${h.title}`).join('\n') || '(none stored)'}`,
    ...(context.jobs.length
      ? context.jobs.map(job => `Failed job: ${job.name}\nFailed steps: ${job.failedSteps.join(', ') || '(not reported)'}\nLog excerpt:\n\`\`\`\n${job.log}\n\`\`\``)
      : ['No job failed with a log: the run failed before its jobs started (often an invalid workflow file or a missing permission).']),
    context.workflowFile ? `Workflow file at this commit:\n\`\`\`yaml\n${context.workflowFile}\n\`\`\`` : 'Workflow file: not available',
  ]
  return redactSecrets(parts.join('\n\n'))
}

const KINDS: CiFailureKind[] = ['code', 'flaky', 'ci-setup', 'base-red', 'unknown']

/** The model's JSON answer; when it is not JSON, the text itself as the cause. */
export function parseAnswer(text: string): Pick<CiExplanation, 'failed' | 'cause' | 'kind' | 'fix' | 'confidence' | 'confidenceReason' | 'raw'> {
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  try {
    const value = JSON.parse(json ?? '') as Record<string, unknown>
    const str = (key: string) => (typeof value[key] === 'string' ? value[key] as string : '')
    const kind = str('kind') as CiFailureKind
    const confidence = str('confidence')
    if (!str('cause')) throw new Error('no cause')
    return {
      failed: str('failed'),
      cause: str('cause'),
      kind: KINDS.includes(kind) ? kind : 'unknown',
      fix: str('fix'),
      confidence: confidence === 'high' || confidence === 'medium' ? confidence : 'low',
      confidenceReason: str('confidenceReason'),
    }
  }
  catch {
    return { failed: '', cause: text.trim(), kind: 'unknown', fix: '', confidence: 'low', confidenceReason: 'The answer was not in the expected form.', raw: text }
  }
}

interface ClaudeResult {
  result?: string
  is_error?: boolean
  modelUsage?: Record<string, unknown>
}

/** `claude -p` with no tools, no MCP servers and no settings, in an empty folder: the prompt goes in on stdin, text comes out. */
export function askClaude(prompt: string, system = SYSTEM_PROMPT): Promise<{ text: string, model: string }> {
  const cwd = mkdtempSync(join(tmpdir(), 'ci-explain-'))
  return new Promise<{ text: string, model: string }>((resolve, reject) => {
    const child = execFile(process.env.REPO_DASHBOARD_CLAUDE || 'claude', [
      '-p', '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence',
      '--output-format', 'json', '--system-prompt', system,
    ], { cwd, timeout: 240_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } }, (error, stdout, stderr) => {
      rmSync(cwd, { recursive: true, force: true })
      let parsed: ClaudeResult | null = null
      try {
        parsed = JSON.parse(stdout) as ClaudeResult
      }
      catch {
        // Not JSON: the error below says what happened.
      }
      if (!parsed?.result || parsed.is_error) {
        const reason = parsed?.result || stderr.trim() || (error as Error | null)?.message || 'no answer'
        reject(new Error(`Claude did not answer: ${reason.slice(0, 300)}`))
        return
      }
      resolve({ text: parsed.result, model: Object.keys(parsed.modelUsage ?? {})[0] ?? 'claude' })
    })
    child.stdin?.end(prompt)
  })
}

const inFlight = new Map<number, Promise<CiExplanation>>()

/** The explanation of a failed run: from the cache, or made now (20-60 s). A second click while it runs waits for the same one. */
export function explainRun(store: CiStore, runId: number): Promise<CiExplanation> {
  const cached = store.explanation(runId)
  if (cached) return Promise.resolve(cached)
  const running = inFlight.get(runId)
  if (running) return running
  const run = store.run(runId)
  if (!run) return Promise.reject(new Error('Unknown run'))
  if (run.state !== 'failure') return Promise.reject(new Error('Only failed runs can be explained'))

  const promise = (async () => {
    const context = await collectContext(store, run)
    const { text, model } = await askClaude(buildPrompt(context))
    const explanation: CiExplanation = {
      runId,
      createdAt: new Date().toISOString(),
      model,
      steps: context.jobs.flatMap(job => (job.failedSteps.length ? job.failedSteps.map(step => `${job.name} › ${step}`) : [job.name])),
      ...parseAnswer(text),
    }
    store.saveExplanation(explanation)
    return explanation
  })().finally(() => inFlight.delete(runId))
  inFlight.set(runId, promise)
  return promise
}
