import { readdirSync } from 'node:fs'
import type { InboxTask } from '#shared/types/inbox'
import { filesRoot, resolveWorkspacePath } from './files'

/**
 * Words in an item's text that look like a file or folder path: they contain a `/` or end in an extension
 * (`pds-backlog/reports/screenshots/2026-10/`, `plan.md`). Quotes, backticks and closing punctuation around them are dropped;
 * URLs are left to the link detection on the page.
 */
export function pathTokens(text: string): string[] {
  const found = new Set<string>()
  for (const word of text.split(/\s+/)) {
    const token = word.replace(/^[`'"(<[]+/, '').replace(/[`'")>\],.;:!?]+$/, '')
    if (!token || token.includes('://') || token.startsWith('@') || /^\/+$/.test(token)) continue
    if (token.includes('/') || /\.[a-z][a-z0-9]{0,7}$/i.test(token)) found.add(token)
  }
  return [...found]
}

const TTL = 30_000
const cache = new Map<string, { at: number, value: string | null }>()

function resolveCached(path: string, preferred: string[]): string | null {
  const key = `${preferred.join(',')}|${path}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  const value = resolveWorkspacePath(path, { preferred })
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 5000) cache.clear()
  return value
}

/** The session folders by number (`lss-001-claude-workspace-11` for 11), so an item's paths are found in its own session first. */
function sessionFolders(): Map<number, string> {
  const folders = new Map<number, string>()
  try {
    for (const name of readdirSync(filesRoot())) {
      const n = /-claude-workspace-(\d+)$/.exec(name)?.[1]
      if (n) folders.set(Number(n), name)
    }
  }
  catch { /* no workspace: nothing to prefer */ }
  return folders
}

/** Adds where file anchors and paths in item bodies really are, so the inbox can link them to /files. Changes `tasks` in place. */
export function annotateFiles(tasks: InboxTask[]): void {
  const folders = sessionFolders()
  for (const task of tasks) {
    const own = task.session === null ? undefined : folders.get(task.session)
    const preferred = own ? [own] : []
    for (const item of task.items ?? []) {
      for (const anchor of item.anchors ?? []) {
        if (anchor.type !== 'file' || !anchor.path) continue
        const real = resolveCached(anchor.path, preferred)
        if (real) anchor.resolved = real
      }
      const paths: Record<string, string> = {}
      for (const token of pathTokens(item.body ?? '')) {
        const real = resolveCached(token, preferred)
        if (real) paths[token] = real
      }
      if (Object.keys(paths).length) item.paths = paths
    }
  }
}
