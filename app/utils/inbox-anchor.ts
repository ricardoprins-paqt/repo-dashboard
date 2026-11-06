import type { InboxItem, InboxTask, ItemKind } from '#shared/types/inbox'

/** The item id in a `#I-374` hash, or null. */
export function itemFromHash(hash: string | null | undefined): number | null {
  const m = /^#I-(\d+)$/.exec(hash ?? '')
  return m ? Number(m[1]) : null
}

/** Where an item is relative to the "Needs you" list: on it, hidden by the type filter, or not on it (and why). */
export type ItemPlace
  = | { place: 'shown' | 'filtered', item: InboxItem, task: InboxTask }
    | { place: 'held' | 'answered' | 'snoozed' | 'closed' | 'fyi', item: InboxItem, task: InboxTask }
    | { place: 'missing' }

export function locateItem(tasks: InboxTask[], id: number, shownKinds: ReadonlySet<ItemKind>): ItemPlace {
  for (const task of tasks) {
    const item = task.items.find(i => i.id === id)
    if (!item) continue
    if (item.held_since) return { place: 'held', item, task }
    // FYIs are in the daily summary (/summary), not in the inbox; a critical one still shows.
    if (item.needs_you && item.kind === 'fyi' && item.severity !== 'critical') return { place: 'fyi', item, task }
    if (item.needs_you) return { place: shownKinds.has(item.kind) ? 'shown' : 'filtered', item, task }
    if (item.status === 'answered' || item.status === 'delivered') return { place: 'answered', item, task }
    if (item.status === 'snoozed') return { place: 'snoozed', item, task }
    return { place: 'closed', item, task }
  }
  return { place: 'missing' }
}

/** The line shown when a linked item has no card on the page. */
export function placeNotice(id: number, found: ItemPlace): string | null {
  const session = 'task' in found ? found.task.session : null
  switch (found.place) {
    case 'shown':
    case 'filtered':
      return null
    case 'fyi':
      return `I-${id} is an FYI: FYIs are in the daily summary (FYI summary page), not in the inbox.`
    case 'held':
      return `I-${id} is waiting for you in session ${session ?? '?'}'s chat; it shows here if you don't answer there.`
    case 'answered':
      return found.item.status === 'delivered'
        ? `I-${id} is answered and your answer went to session ${found.item.delivered_to ?? session ?? '?'}.`
        : `I-${id} is answered; your answer goes to session ${session ?? '?'} as soon as it can take it.`
    case 'snoozed':
      return `I-${id} is snoozed${found.item.snooze_until ? ` until ${new Date(found.item.snooze_until).toLocaleString()}` : ''}.`
    case 'closed':
      return `I-${id} is closed (${found.item.status})${found.item.note ? `: ${found.item.note}` : ''}.`
    case 'missing':
      return `I-${id} is not in the inbox any more (closed items drop out after a few days).`
  }
}
