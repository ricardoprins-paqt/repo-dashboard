import type { InboxItem, InboxTask, ItemKind } from '#shared/types/inbox'

export type InboxSort = 'kind' | 'oldest' | 'newest'

export const INBOX_SORTS: Array<{ label: string, value: InboxSort }> = [
  { label: 'Type, then oldest first', value: 'kind' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Newest first', value: 'newest' },
]

/** The kinds in their "most urgent first" order, with the labels the page shows. */
export const INBOX_KINDS: Array<{ kind: ItemKind, label: string }> = [
  { kind: 'decision', label: 'Decisions' },
  { kind: 'question', label: 'Questions' },
  { kind: 'conflict', label: 'Conflicts' },
  { kind: 'review', label: 'Reviews' },
  { kind: 'fyi', label: 'FYIs' },
]

// Decisions and questions are both "only Ricardo can answer this", so they share the top.
const KIND_RANK: Record<ItemKind, number> = { decision: 0, question: 0, conflict: 1, review: 2, fyi: 3 }

export interface InboxEntry { item: InboxItem, task: InboxTask }

/** The items that need Ricardo, limited to the kinds he has switched on, in the chosen order. */
export function needsYouList(entries: InboxEntry[], kinds: ReadonlySet<ItemKind>, sort: InboxSort): InboxEntry[] {
  const byDate = (a: InboxEntry, b: InboxEntry) => a.item.created.localeCompare(b.item.created) || a.item.id - b.item.id
  return entries
    .filter(({ item }) => item.needs_you && kinds.has(item.kind))
    .sort((a, b) => {
      if (sort === 'newest') return byDate(b, a)
      if (sort === 'oldest') return byDate(a, b)
      return KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind] || byDate(a, b)
    })
}
