import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LabExperiment, LabIdea, LabOverview, LabProposal, LabRun, LabTick } from '#shared/types/lab'

/**
 * Reads the lab loop: its files in pds-backlog (written by the product owner session) and the timer's own state in
 * ~/.local/state/paqt-loop (written by `paqt-loop tick`). Nothing here writes.
 */
export interface LabPaths { loopDir: string, stateDir: string, proxyPort?: number }

export function defaultLabPaths(): LabPaths {
  const home = homedir()
  return {
    loopDir: join(process.env.PDS_BACKLOG || join(home, 'workspace/ricardoprins-paqt/pds-backlog'), 'loops/lab'),
    stateDir: join(process.env.XDG_STATE_HOME || join(home, '.local/state'), 'paqt-loop'),
  }
}

const readText = (file: string): string | null => (existsSync(file) ? readFileSync(file, 'utf8') : null)
function readJson<T>(file: string, fallback: T): T {
  try {
    const text = readText(file)
    return text ? JSON.parse(text) as T : fallback
  }
  catch {
    return fallback
  }
}
function readJsonLines<T>(file: string, last: number): T[] {
  return (readText(file) ?? '').split('\n').filter(Boolean).slice(-last).flatMap((line) => {
    try {
      return [JSON.parse(line) as T]
    }
    catch {
      return []
    }
  }).reverse()
}

/** `# Title`, a `Status: x` line and the first paragraph after the Recommendation heading. */
export function parseProposal(id: string, text: string): LabProposal {
  const lines = text.split('\n')
  const title = lines.find(l => l.startsWith('# '))?.slice(2).trim() ?? id
  const status = text.match(/^\**Status:?\**:?\s*(\w+)/im)?.[1]?.toLowerCase() ?? 'draft'
  const start = lines.findIndex(l => /^(#+\s*|\*\*)Recommendation/i.test(l.trim()))
  let recommendation = ''
  if (start >= 0) {
    const inline = lines[start]!.replace(/^(#+\s*|\*\*)Recommendation\**:?\**\s*/i, '').trim()
    const rest = lines.slice(start + 1)
    const from = rest.findIndex(l => l.trim() !== '')
    const until = rest.slice(from).findIndex(l => l.trim() === '' || /^#/.test(l))
    recommendation = inline || rest.slice(from, until === -1 ? undefined : from + until).join(' ').trim()
  }
  return { id, title, status, recommendation, url: `https://github.com/ricardoprins-paqt/pds-backlog/blob/main/loops/lab/proposals/${id}.md` }
}

function readProposals(dir: string): LabProposal[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => parseProposal(f.slice(0, -3), readFileSync(join(dir, f), 'utf8')))
}

const APPS = ['storybook', 'blocks', 'docs', 'token-forge']
const IDEA_ORDER: Record<LabIdea['status'], number> = { next: 0, doing: 1, ready: 2, done: 3, dropped: 4 }

export function readLab(paths: LabPaths = defaultLabPaths()): LabOverview {
  const loop = readJson<{ session?: number, intervalMinutes?: number, paused?: boolean } | null>(join(paths.loopDir, 'loop.json'), null)
  const session = Number(loop?.session ?? 0)
  const proxyPort = paths.proxyPort ?? 8080
  const previewBase = (app: string) => `http://s${session}-${app}.localhost:${proxyPort}`
  const empty: LabOverview = {
    available: false, session, intervalMinutes: 60, paused: false, worker: null, research: null, lastTickAt: null, timerRanAt: null, nextTickAt: null,
    pinnedAt: null, lastResearchAt: null, experiments: [], ideas: [], proposals: [], ticks: [], runs: [], previews: [],
  }
  if (!loop) return { ...empty, error: `No loop.json in ${paths.loopDir}` }

  const intervalMinutes = Number(loop.intervalMinutes ?? 60)
  const state = readJson<{ worker?: LabOverview['worker'], research?: LabOverview['research'] }>(join(paths.loopDir, 'state.json'), {})
  const clock = readJson<{ lastTickAt?: string, lastRunAt?: string }>(join(paths.stateDir, 'lab.json'), {})
  const lastTickAt = clock.lastTickAt ?? null
  const nextTickAt = lastTickAt ? new Date(Date.parse(lastTickAt) + intervalMinutes * 60000).toISOString() : null

  const experiments = readJson<Omit<LabExperiment, 'previewUrl'>[]>(join(paths.loopDir, 'experiments.json'), [])
    .map(e => ({
      ...e,
      previewUrl: e.status === 'in-lab-main' || e.status === 'liked' ? `${previewBase(e.app)}${e.previewPath}` : null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const ideas = readJson<LabIdea[]>(join(paths.loopDir, 'ideas.json'), [])
    .filter(i => i.status !== 'done')
    .sort((a, b) => IDEA_ORDER[a.status] - IDEA_ORDER[b.status] || b.value - a.value)
  const pinned = (readText(join(paths.loopDir, 'pins.conf')) ?? '').match(/^# pinned (\S+)/m)?.[1] ?? null
  const research = readJson<Array<{ checkedAt?: string }>>(join(paths.loopDir, 'research-log.json'), [])
  const lastResearchAt = research.map(r => r.checkedAt ?? '').sort().at(-1) || null

  return {
    available: true,
    session,
    intervalMinutes,
    paused: Boolean(loop.paused),
    worker: state.worker ?? null,
    research: state.research ?? null,
    lastTickAt,
    timerRanAt: clock.lastRunAt ?? null,
    nextTickAt,
    pinnedAt: pinned,
    lastResearchAt,
    experiments,
    ideas,
    proposals: readProposals(join(paths.loopDir, 'proposals')),
    ticks: readJsonLines<LabTick>(join(paths.stateDir, 'lab.jsonl'), 30),
    runs: readJsonLines<LabRun>(join(paths.loopDir, 'runs.jsonl'), 30),
    previews: APPS.map(app => ({ app, url: previewBase(app) })),
  }
}
