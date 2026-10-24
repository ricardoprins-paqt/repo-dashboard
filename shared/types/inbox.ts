/** Ricardo's tasks and inbox items across the Claude sessions, from the status service (lss-tools, /api/inbox). */

export type TaskStatus = 'working' | 'waiting' | 'ready' | 'done' | 'dropped'
export type ItemKind = 'question' | 'decision' | 'review' | 'conflict' | 'fyi'
export type ItemStatus = 'open' | 'answered' | 'delivered' | 'done' | 'obsolete' | 'snoozed'

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
  title: string
  body: string
  options: string[]
  anchors: InboxAnchor[]
  status: ItemStatus
  answer: string | null
  answered_at: string | null
  delivered_at: string | null
  delivered_to: number | null
  snooze_until: string | null
  note: string | null
  created: string
  updated: string
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
  created: string
  updated: string
  summarized_at: string | null
  closed_note: string | null
  items: InboxItem[]
}

export interface InboxSession {
  n: number
  name: string | null
  status: 'idle' | 'busy' | 'not running' | string
  background: boolean
  conversation: string | null
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
