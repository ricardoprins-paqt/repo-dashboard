import { describe, expect, it } from 'vitest'
import { githubSlug, parseBranches, parseCommits, parseStatusV2, parseTrack } from '../../server/lib/git'

const US = '\u001F'

describe('parseStatusV2', () => {
  it('reads branch, upstream and ahead/behind', () => {
    const status = parseStatusV2([
      '# branch.oid 0123456789abcdef',
      '# branch.head feature/x',
      '# branch.upstream origin/feature/x',
      '# branch.ab +2 -3',
    ].join('\n'))

    expect(status).toMatchObject({ branch: 'feature/x', detached: false, upstream: 'origin/feature/x', ahead: 2, behind: 3, headSha: '0123456789abcdef' })
  })

  it('handles a detached HEAD and a repository without commits', () => {
    expect(parseStatusV2('# branch.oid abc\n# branch.head (detached)')).toMatchObject({ branch: null, detached: true })
    expect(parseStatusV2('# branch.oid (initial)\n# branch.head main').headSha).toBeNull()
  })

  it('counts staged, unstaged, untracked and conflicted entries', () => {
    const { workingTree } = parseStatusV2([
      '# branch.head main',
      '1 M. N... 100644 100644 100644 aaa bbb staged.ts',
      '1 .M N... 100644 100644 100644 aaa bbb unstaged.ts',
      '1 MM N... 100644 100644 100644 aaa bbb both.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new name.ts\told name.ts',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.ts',
      '? notes.txt',
    ].join('\n'))

    expect(workingTree).toMatchObject({ staged: 3, unstaged: 2, untracked: 1, conflicted: 1 })
    expect(workingTree.files.map(file => file.path)).toEqual(['staged.ts', 'unstaged.ts', 'both.ts', 'new name.ts', 'conflict.ts', 'notes.txt'])
    expect(workingTree.files.find(file => file.path === 'new name.ts')?.kind).toBe('staged')
    expect(workingTree.files.find(file => file.path === 'both.ts')?.kind).toBe('staged')
  })

  it('caps the listed files but keeps counting', () => {
    const lines = Array.from({ length: 100 }, (_, index) => `? file-${index}.txt`).join('\n')
    const { workingTree } = parseStatusV2(lines)

    expect(workingTree.untracked).toBe(100)
    expect(workingTree.files).toHaveLength(60)
    expect(workingTree.filesTruncated).toBe(true)
  })
})

describe('parseTrack', () => {
  it.each([
    ['', { ahead: 0, behind: 0, gone: false }],
    ['[ahead 2]', { ahead: 2, behind: 0, gone: false }],
    ['[behind 4]', { ahead: 0, behind: 4, gone: false }],
    ['[ahead 1, behind 5]', { ahead: 1, behind: 5, gone: false }],
    ['[gone]', { ahead: 0, behind: 0, gone: true }],
  ])('parses %j', (track, expected) => {
    expect(parseTrack(track)).toEqual(expected)
  })
})

describe('parseBranches', () => {
  it('marks the current and merged branches', () => {
    const output = [
      ['main', 'origin/main', '', '2026-10-01T10:00:00+00:00', '*'],
      ['old', 'origin/old', '[gone]', '2026-01-01T10:00:00+00:00', ' '],
      ['local-only', '', '', '2026-09-01T10:00:00+00:00', ' '],
    ].map(parts => parts.join(US)).join('\n')

    const branches = parseBranches(output, new Set(['old']))

    expect(branches.map(branch => [branch.name, branch.current, branch.merged, branch.upstreamGone, branch.upstream])).toEqual([
      ['main', true, false, false, 'origin/main'],
      ['old', false, true, true, 'origin/old'],
      ['local-only', false, false, false, null],
    ])
  })
})

describe('parseCommits', () => {
  it('keeps subjects intact', () => {
    const [commit] = parseCommits(['abc1234', 'Ada', '2026-10-01T10:00:00+00:00', 'fix: a, b and c'].join(US))

    expect(commit).toEqual({ hash: 'abc1234', author: 'Ada', date: '2026-10-01T10:00:00+00:00', subject: 'fix: a, b and c' })
  })
})

describe('githubSlug', () => {
  it.each([
    ['https://github.com/paqtdesign/paqt-ds.git', 'paqtdesign/paqt-ds'],
    ['https://github.com/paqtdesign/paqt-ds', 'paqtdesign/paqt-ds'],
    ['git@github.com:paqtdesign/paqt-ds.git', 'paqtdesign/paqt-ds'],
    ['https://github.com/o/repo.with.dots.git', 'o/repo.with.dots'],
    ['https://gitlab.com/o/r.git', null],
    [null, null],
  ])('%j -> %j', (url, slug) => {
    expect(githubSlug(url)).toBe(slug)
  })
})
