import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readFun } from '../../server/lib/fun.ts'

function setup(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'fun-'))
  const loopDir = join(root, 'loop')
  const stateDir = join(root, 'state')
  mkdirSync(loopDir)
  mkdirSync(stateDir)
  for (const [name, content] of Object.entries(files)) writeFileSync(join(name.startsWith('state/') ? root : loopDir, name), content)
  return { loopDir, stateDir }
}

const experiment = (id: string, status: string, createdAt: string) => ({
  id, name: id, repo: 'paqt-ds-blocks', branch: `fun/${id}`, app: 'blocks', previewPath: `/x/${id}`, description: '', pr: 1,
  prUrl: '', status, origin: '', createdAt,
})

describe('readFun', () => {
  it('is unavailable without a loop.json', () => {
    const fun = readFun(setup({}))
    expect(fun.available).toBe(false)
    expect(fun.error).toMatch(/No loop.json/)
  })

  it('links experiments in fun/main to the session\'s dev server, newest first', () => {
    const fun = readFun(setup({
      'loop.json': JSON.stringify({ session: 2, intervalMinutes: 60 }),
      'experiments.json': JSON.stringify([experiment('old', 'in-fun-main', '2026-10-22'), experiment('gone', 'rejected', '2026-10-23'), experiment('new', 'liked', '2026-10-24')]),
    }))
    expect(fun.experiments.map(e => [e.id, e.previewUrl])).toEqual([
      ['new', 'http://s2-blocks.localhost:8080/x/new'],
      ['gone', null],
      ['old', 'http://s2-blocks.localhost:8080/x/old'],
    ])
    expect(fun.previews[0]).toEqual({ app: 'storybook', url: 'http://s2-storybook.localhost:8080' })
  })

  it('reads the timer state, the worker, the pin and the backlog in order', () => {
    const fun = readFun(setup({
      'loop.json': JSON.stringify({ session: 2, intervalMinutes: 120, paused: true }),
      'state.json': JSON.stringify({ worker: { branch: 'fun/x', startedAt: '2026-10-24T10:00:00Z' }, research: null }),
      'state/fun.json': JSON.stringify({ lastTickAt: '2026-10-24T10:00:00.000Z' }),
      'state/fun.jsonl': `${JSON.stringify({ at: 'a', result: 'skipped', reason: 'paused' })}\nnot json\n${JSON.stringify({ at: 'b', result: 'sent' })}\n`,
      'pins.conf': '# comment\n# pinned 2026-10-24\npaqt-ds abc\n',
      'ideas.json': JSON.stringify([
        { id: 'a', title: 'a', repo: 'r', description: '', value: 5, status: 'ready' },
        { id: 'b', title: 'b', repo: 'r', description: '', value: 2, status: 'next' },
        { id: 'c', title: 'c', repo: 'r', description: '', value: 5, status: 'done' },
        { id: 'd', title: 'd', repo: 'r', description: '', value: 3, status: 'ready' },
      ]),
    }))
    expect(fun.paused).toBe(true)
    expect(fun.worker?.branch).toBe('fun/x')
    expect(fun.nextTickAt).toBe('2026-10-24T12:00:00.000Z')
    expect(fun.ticks.map(t => t.at)).toEqual(['b', 'a'])
    expect(fun.pinnedAt).toBe('2026-10-24')
    expect(fun.ideas.map(i => i.id)).toEqual(['b', 'a', 'd'])
  })
})
