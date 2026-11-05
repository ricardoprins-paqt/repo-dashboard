import { describe, expect, it } from 'vitest'
import type { InboxItem, InboxTask, ItemKind } from '../../shared/types/inbox'
import { renderHandoff } from '../../app/utils/handoff'
import { itemFromHash, locateItem, placeNotice } from '../../app/utils/inbox-anchor'
import { linkParts } from '../../app/utils/links'
import { renderMarkdown } from '../../app/utils/markdown'

describe('inbox item references', () => {
  it('turns I-<n> into a link to that card, not inside a longer word', () => {
    expect(linkParts('See I-374 and (I-12). Not API-3 or XI-4.')).toEqual([
      { text: 'See ' },
      { text: 'I-374', item: 374 },
      { text: ' and (' },
      { text: 'I-12', item: 12 },
      { text: '). Not API-3 or XI-4.' },
    ])
  })

  it('leaves an I-<n> inside a URL to the URL', () => {
    const parts = linkParts('Open http://repo-dashboard.localhost:8080/inbox#I-374 now')
    expect(parts.filter(p => 'item' in p)).toEqual([])
    expect(parts.some(p => 'url' in p && p.url.endsWith('#I-374'))).toBe(true)
  })

  it('links references in Markdown, but not in code or existing links, and keeps them in this tab', () => {
    const html = renderMarkdown('Same as I-375.\n\n`I-9` stays code, and [I-8](https://example.com) stays that link.\n\n```\nI-7\n```')
    expect(html).toContain('<a href="/inbox#I-375">I-375</a>')
    expect(html).not.toContain('href="/inbox#I-9"')
    expect(html).not.toContain('href="/inbox#I-8"')
    expect(html).not.toContain('href="/inbox#I-7"')
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">I-8</a>')
  })

  it('links references and URLs in a handoff, and escapes the rest', () => {
    const html = renderHandoff('**Done**: I-12 <b>x</b>\n- see https://github.com/a/b and I-13')
    expect(html).toContain('<strong>Done</strong>')
    expect(html).toContain('<a class="font-mono underline" href="/inbox#I-12">I-12</a>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('<a class="underline" href="https://github.com/a/b" target="_blank" rel="noopener">https://github.com/a/b</a>')
    expect(html).toContain('href="/inbox#I-13"')
  })
})

const item = (fields: Partial<InboxItem>): InboxItem => ({
  id: 1, task_id: 1, kind: 'decision', severity: 'normal', title: 't', body: '', options: [], anchors: [], status: 'open', answer: null,
  answered_at: null, backlog: false, delivered_at: null, delivered_to: null, snooze_until: null, note: null, source: 'cli', needs_you: true,
  created: '2026-11-05T10:00:00Z', updated: '2026-11-05T10:00:00Z', held_since: null, ...fields,
})
const task = (items: InboxItem[]): InboxTask => ({
  id: 1, title: 'task', asked: '', status: 'waiting', session: 7, conversation: null, repo: null, branch: null, pr_url: null, links: [], handoff: '',
  next: '', short: '', source: 'cli', needs_you: 1, created: '', updated: '', summarized_at: null, closed_note: null, items, attachments: [],
})
const all = new Set<ItemKind>(['decision', 'question', 'conflict', 'review', 'fyi'])

describe('jumping to a card', () => {
  it('reads the item from the hash', () => {
    expect(itemFromHash('#I-374')).toBe(374)
    expect(itemFromHash('#main-content')).toBeNull()
    expect(itemFromHash('')).toBeNull()
  })

  it('finds where an item is and says why it has no card', () => {
    const tasks = [task([
      item({ id: 1 }),
      item({ id: 2, kind: 'fyi' }),
      item({ id: 3, needs_you: false, held_since: '2026-11-05T10:00:00Z' }),
      item({ id: 4, needs_you: false, status: 'done', note: 'merged' }),
      item({ id: 5, needs_you: false, status: 'delivered', delivered_to: 9 }),
    ])]
    expect(locateItem(tasks, 1, all).place).toBe('shown')
    expect(locateItem(tasks, 2, new Set<ItemKind>(['decision'])).place).toBe('filtered')
    expect(placeNotice(3, locateItem(tasks, 3, all))).toBe('I-3 is waiting for you in session 7\'s chat; it shows here if you don\'t answer there.')
    expect(placeNotice(4, locateItem(tasks, 4, all))).toBe('I-4 is closed (done): merged.')
    expect(placeNotice(5, locateItem(tasks, 5, all))).toBe('I-5 is answered and your answer went to session 9.')
    expect(placeNotice(99, locateItem(tasks, 99, all))).toContain('not in the inbox any more')
    expect(placeNotice(1, locateItem(tasks, 1, all))).toBeNull()
  })
})
