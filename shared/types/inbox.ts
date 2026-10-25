/** Ricardo's tasks and inbox items across the Claude sessions, from the status service (lss-tools, /api/inbox). */

export type TaskStatus = 'working' | 'waiting' | 'ready' | 'parked' | 'done' | 'dropped'
export type ItemKind = 'question' | 'decision' | 'review' | 'conflict' | 'fyi'
export type ItemStatus = 'open' | 'answered' | 'delivered' | 'done' | 'obsolete' | 'snoozed'
/** critical: PAQT's own components or tools turned out broken (fix at the source, never work around). Shown first, in red. */
export type ItemSeverity = 'normal' | 'critical'

export interface InboxAnchor {
  type: 'pr' | 'branch' | 'file' | string
  url?: string
  repo?: string
  name?: string
  path?: string
}

export interface InboxItem {
  id: number
  task_id: number
  kind: ItemKind
  severity: ItemSeverity
  title: string
  body: string
  options: string[]
  anchors: InboxAnchor[]
  status: ItemStatus
  answer: string | null
  answered_at: string | null
  /** Ricardo ticked "add to backlog": the loop session puts it in its backlog instead of doing it now. */
  backlog: boolean
  delivered_at: string | null
  delivered_to: number | null
  snooze_until: string | null
  note: string | null
  source: string
  /** Decided by the status service (inbox.py NEEDS_YOU): Ricardo still has to act on it. */
  needs_you: boolean
  created: string
  updated: string
}

/** A result a task depends on (list, analysis, plan, report), kept with the task instead of only in a chat. */
export interface InboxAttachment {
  id: number
  task_id?: number
  item_id: number | null
  title: string
  source: string
  created: string
  size?: number
  content?: string
}

export interface InboxTask {
  id: number
  title: string
  asked: string
  status: TaskStatus
  session: number | null
  conversation: string | null
  repo: string | null
  branch: string | null
  pr_url: string | null
  links: Array<{ label: string, url: string }>
  handoff: string
  next: string
  short: string
  source: string
  /** How many of its items need Ricardo (from the status service). */
  needs_you: number
  created: string
  updated: string
  summarized_at: string | null
  closed_note: string | null
  items: InboxItem[]
  attachments: InboxAttachment[]
}

export interface InboxSession {
  n: number
  name: string | null
  status: 'idle' | 'busy' | 'not running' | string
  background: boolean
  conversation: string | null
  /** All decided by the status service (inbox.py annotate_sessions), so the dashboard and the dispatcher agree. */
  reserved: boolean
  pinned: boolean
  loop: boolean
  free: boolean
  task_id: number | null
  /** The loop this session runs (pds-backlog loops/<name>), whether it keeps a backlog, and what runs inside it now. */
  loop_name: string | null
  backlog: boolean
  activity: Array<{ kind: 'worker' | 'research' | string, label: string, since: string | null }>
}

export interface InboxOverview {
  available: boolean
  error?: string
  tasks: InboxTask[]
  sessions: InboxSession[]
  pins: number[]
  /** Sessions with a fixed job (builder, lab PO, assistant): never used to resume a task. */
  reserved: number[]
  generatedAt: string
}
