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
      // Critical items always come first, whatever the sort.
      const critical = Number(b.item.severity === 'critical') - Number(a.item.severity === 'critical')
      if (critical) return critical
      if (sort === 'newest') return byDate(b, a)
      if (sort === 'oldest') return byDate(a, b)
      return KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind] || byDate(a, b)
    })
}

/**
 * What a click on a kind does. A plain click shows only that kind; clicking the only kind shown brings all of them back.
 * With cmd/ctrl (additive) it adds or removes that kind; removing the last one shows all again (never an empty filter).
 */
export function nextKinds(current: ReadonlySet<ItemKind>, kind: ItemKind, additive: boolean, all: readonly ItemKind[]): Set<ItemKind> {
  if (additive) {
    const next = new Set(current)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    return next.size ? next : new Set(all)
  }
  const onlyThis = current.size === 1 && current.has(kind)
  return onlyThis ? new Set(all) : new Set([kind])
}
