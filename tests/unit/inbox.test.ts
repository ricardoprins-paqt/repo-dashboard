import { describe, expect, it } from 'vitest'
import type { InboxItem, InboxTask, ItemKind } from '#shared/types/inbox'
import { needsYouList, nextKinds } from '../../app/utils/inbox'

const task = { id: 1 } as InboxTask
const entry = (id: number, kind: ItemKind, created: string, needs_you = true) => ({ item: { id, kind, created, needs_you } as InboxItem, task })
const entries = [
  entry(1, 'fyi', '2026-10-24T08:00:00Z'),
  entry(2, 'decision', '2026-10-24T10:00:00Z'),
  entry(3, 'review', '2026-10-24T09:00:00Z'),
  entry(4, 'question', '2026-10-24T07:00:00Z'),
  entry(5, 'conflict', '2026-10-24T11:00:00Z', false),
]
const all = new Set<ItemKind>(['decision', 'question', 'conflict', 'review', 'fyi'])
const ids = (list: ReturnType<typeof needsYouList>) => list.map(e => e.item.id)

describe('needsYouList', () => {
  it('sorts by type (decisions and questions first), then oldest first', () => {
    expect(ids(needsYouList(entries, all, 'kind'))).toEqual([4, 2, 3, 1])
  })
  it('sorts by date either way', () => {
    expect(ids(needsYouList(entries, all, 'oldest'))).toEqual([4, 1, 3, 2])
    expect(ids(needsYouList(entries, all, 'newest'))).toEqual([2, 3, 1, 4])
  })
  it('only shows the kinds that are switched on, and only what needs Ricardo', () => {
    expect(ids(needsYouList(entries, new Set<ItemKind>(['review', 'fyi', 'conflict']), 'kind'))).toEqual([3, 1])
  })
})

describe('nextKinds', () => {
  const ALL: ItemKind[] = ['decision', 'question', 'conflict', 'review', 'fyi']
  const list = (s: Set<ItemKind>) => [...s].sort()
  it('a click shows only that kind, and clicking it again shows all', () => {
    const one = nextKinds(new Set(ALL), 'review', false, ALL)
    expect(list(one)).toEqual(['review'])
    expect(list(nextKinds(one, 'review', false, ALL))).toEqual([...ALL].sort())
    expect(list(nextKinds(one, 'fyi', false, ALL))).toEqual(['fyi'])
  })
  it('cmd/ctrl-click adds or removes one kind, and never leaves nothing', () => {
    const two = nextKinds(new Set<ItemKind>(['review']), 'conflict', true, ALL)
    expect(list(two)).toEqual(['conflict', 'review'])
    expect(list(nextKinds(two, 'review', true, ALL))).toEqual(['conflict'])
    expect(list(nextKinds(new Set<ItemKind>(['conflict']), 'conflict', true, ALL))).toEqual([...ALL].sort())
  })
})
