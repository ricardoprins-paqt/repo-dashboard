import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { allowedPath, readEntry, resolveWorkspacePath } from '../../server/lib/files'
import { pathTokens } from '../../server/lib/inbox-files'
import { linkParts } from '../../app/utils/links'

// A small workspace: two hubs with a checkout each, a session folder with a worktree, and things that must never be served.
const outside = mkdtempSync(join(tmpdir(), 'files-outside-'))
const root = mkdtempSync(join(tmpdir(), 'files-root-'))
const write = (path: string, content = 'x') => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}
write(join(root, 'ricardoprins-paqt/pds-backlog/.git/HEAD'))
write(join(root, 'ricardoprins-paqt/pds-backlog/reports/shots/a.png'), '\u0000PNG')
write(join(root, 'ricardoprins-paqt/pds-backlog/goals.md'), '# Goals')
write(join(root, 'paqtdesign/paqt-ds/.git/HEAD'))
write(join(root, 'paqtdesign/paqt-ds/packages/vue/x.vue'))
write(join(root, 'paqtdesign/paqt-ds/README.md'))
write(join(root, 'lss-001-claude-workspace-3/paqt-ds/.git'), 'gitdir: elsewhere')
write(join(root, 'lss-001-claude-workspace-3/paqt-ds/packages/vue/x.vue'))
write(join(root, 'lss-001-claude-workspace-3/paqt-ds/README.md'))
write(join(root, 'ricardoprins-paqt/pds-backlog/.env'), 'SECRET=1')
write(join(root, 'ricardoprins-paqt/pds-backlog/deploy.pem'))
write(join(outside, 'secret.txt'))
symlinkSync(outside, join(root, 'ricardoprins-paqt/pds-backlog/escape'))
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('allowedPath', () => {
  it('allows files and folders inside the root', () => {
    expect(allowedPath(join(root, 'ricardoprins-paqt/pds-backlog/goals.md'), root)).toMatch(/goals\.md$/)
    expect(allowedPath(root, root)).not.toBeNull()
  })

  it('refuses hidden files, keys, paths outside the root and symlinks that lead out', () => {
    expect(allowedPath(join(root, 'ricardoprins-paqt/pds-backlog/.env'), root)).toBeNull()
    expect(allowedPath(join(root, 'ricardoprins-paqt/pds-backlog/.git/HEAD'), root)).toBeNull()
    expect(allowedPath(join(root, 'ricardoprins-paqt/pds-backlog/deploy.pem'), root)).toBeNull()
    expect(allowedPath(join(outside, 'secret.txt'), root)).toBeNull()
    expect(allowedPath(join(root, 'ricardoprins-paqt/pds-backlog/escape/secret.txt'), root)).toBeNull()
    expect(allowedPath(join(root, '../'), root)).toBeNull()
  })
})

describe('resolveWorkspacePath', () => {
  it('finds a path relative to a checkout', () => {
    expect(resolveWorkspacePath('pds-backlog/goals.md', { root })).toBe(join(root, 'ricardoprins-paqt/pds-backlog/goals.md'))
    expect(resolveWorkspacePath('pds-backlog/reports/shots/', { root })).toBe(join(root, 'ricardoprins-paqt/pds-backlog/reports/shots'))
  })

  it('prefers the item\'s own session, then the hubs', () => {
    expect(resolveWorkspacePath('packages/vue/x.vue', { root })).toBe(join(root, 'paqtdesign/paqt-ds/packages/vue/x.vue'))
    expect(resolveWorkspacePath('packages/vue/x.vue', { root, preferred: ['lss-001-claude-workspace-3'] }))
      .toBe(join(root, 'lss-001-claude-workspace-3/paqt-ds/packages/vue/x.vue'))
  })

  it('only takes a bare name when exactly one place has it', () => {
    expect(resolveWorkspacePath('goals.md', { root })).toBe(join(root, 'ricardoprins-paqt/pds-backlog/goals.md'))
    expect(resolveWorkspacePath('README.md', { root })).toBeNull()
  })

  it('refuses what is not there or not allowed', () => {
    expect(resolveWorkspacePath('shell.css', { root })).toBeNull()
    expect(resolveWorkspacePath('pds-backlog/.env', { root })).toBeNull()
    expect(resolveWorkspacePath('../../etc/passwd', { root })).toBeNull()
    expect(resolveWorkspacePath(join(outside, 'secret.txt'), { root })).toBeNull()
  })
})

describe('readEntry', () => {
  it('lists a folder without hidden files, keys or symlinks, and tells images from text', async () => {
    const folder = await readEntry(join(root, 'ricardoprins-paqt/pds-backlog'), root)
    expect(folder.kind).toBe('folder')
    expect(folder.relative).toBe('ricardoprins-paqt/pds-backlog')
    expect(folder.entries?.map(e => e.name)).toEqual(['reports', 'goals.md'])
    const shots = await readEntry(join(root, 'ricardoprins-paqt/pds-backlog/reports/shots'), root)
    expect(shots.entries).toEqual([expect.objectContaining({ name: 'a.png', kind: 'image' })])
    expect(await readEntry(join(root, 'ricardoprins-paqt/pds-backlog/goals.md'), root)).toMatchObject({ kind: 'markdown', content: '# Goals' })
  })
})

describe('pathTokens', () => {
  it('finds paths and file names, without quotes, punctuation or URLs', () => {
    expect(pathTokens('22 screenshots are in pds-backlog/reports/screenshots/2026-10/: 9 new. See `shell.css`, and https://github.com/x/y.md.'))
      .toEqual(['pds-backlog/reports/screenshots/2026-10/', 'shell.css'])
  })
})

describe('linkParts', () => {
  it('links URLs and found paths, and keeps the rest as text', () => {
    expect(linkParts('Full list: https://github.com/a/b.md. Shots in pds-backlog/shots/ now', { 'pds-backlog/shots/': '/w/pds-backlog/shots' })).toEqual([
      { text: 'Full list: ' },
      { text: 'https://github.com/a/b.md', url: 'https://github.com/a/b.md' },
      { text: '. Shots in ' },
      { text: 'pds-backlog/shots/', file: '/w/pds-backlog/shots' },
      { text: ' now' },
    ])
  })

  it('is just text when there is nothing to link', () => {
    expect(linkParts('nothing here')).toEqual([{ text: 'nothing here' }])
  })
})
