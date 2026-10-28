import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FileEntry, FileKind } from '#shared/types/files'

/**
 * Files that inbox items point to (reports, screenshots, plans) are shown on the dashboard instead of only named, so nobody
 * needs a terminal to find them. Only files under the workspace (`~/workspace`, or REPO_DASHBOARD_FILES_ROOT) are served,
 * never hidden ones (`.env`, `.git`, `.npmrc`, ...) or keys.
 */
export const filesRoot = () => resolve(process.env.REPO_DASHBOARD_FILES_ROOT || join(homedir(), 'workspace'))

/** Text bigger than this is not shown in the page (it can still be opened raw). */
export const TEXT_MAX = 1_000_000

const EXT_KIND: Record<string, FileKind> = {
  '.md': 'markdown', '.markdown': 'markdown',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.avif': 'image', '.svg': 'image',
  '.pdf': 'pdf',
}
const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
}
const SECRET_NAME = /\.(pem|key|p12|pfx|kdbx|keystore)$|^id_(rsa|dsa|ecdsa|ed25519)/i

/** The real path of `path` when the dashboard may show it: inside the root, no hidden part, not a key. Otherwise null. */
export function allowedPath(path: string, root = filesRoot()): string | null {
  let real: string
  let realRoot: string
  try {
    real = realpathSync(path)
    realRoot = realpathSync(root)
  }
  catch {
    return null
  }
  const rel = relative(realRoot, real)
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  const parts = rel ? rel.split(sep) : []
  if (parts.some(part => part.startsWith('.')) || SECRET_NAME.test(basename(real))) return null
  return real
}

/**
 * Folders one level below the root and the git checkouts in them (`ricardoprins-paqt/pds-backlog`, a session's `paqt-ds`
 * worktree), each folder followed by its own checkouts.
 */
function checkouts(root: string, preferred: string[]): string[] {
  const dirs = (path: string) => {
    try {
      return readdirSync(path, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => join(path, d.name))
    }
    catch {
      return []
    }
  }
  const top = dirs(root)
  // The hubs first, then the folders a caller prefers (the item's own session), then the rest.
  const rank = (path: string) => {
    const name = basename(path)
    if (preferred.includes(name)) return 0
    if (name === 'ricardoprins-paqt' || name === 'paqtdesign') return 1
    return 2
  }
  top.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return [root, ...top.flatMap(dir => [dir, ...dirs(dir).filter(d => existsSync(join(d, '.git')))])]
}

/**
 * Where a path written by an agent lives. Absolute paths and `~/...` are taken as they are; a relative path such as
 * `pds-backlog/reports/x.md` or `packages/vue/src/...` is looked up in the root and in each checkout below it, first in
 * `preferred` folders (e.g. `lss-001-claude-workspace-11`), then the hubs. A bare name without a folder (`plan.md`) only
 * counts when exactly one place has it. Returns the real path, or null when it is nowhere (or not allowed).
 */
export function resolveWorkspacePath(input: string, { root = filesRoot(), preferred = [] as string[] } = {}): string | null {
  const path = input.trim().replace(/^~(?=\/)/, homedir())
  if (!path || path.includes('\0')) return null
  if (isAbsolute(path)) return allowedPath(path, root)
  const bare = !path.replace(/\/+$/, '').includes('/')
  const found = new Set<string>()
  for (const dir of checkouts(root, preferred)) {
    const candidate = join(dir, path)
    const real = existsSync(candidate) ? allowedPath(candidate, root) : null
    if (!real) continue
    if (!bare) return real
    found.add(real)
    if (found.size > 1) return null
  }
  return found.size === 1 ? [...found][0]! : null
}

export function fileKind(name: string): FileKind {
  return EXT_KIND[extname(name).toLowerCase()] ?? 'text'
}

export function mimeType(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? 'text/plain; charset=utf-8'
}

/** A text file has no NUL byte in its first 8 KB. */
async function looksBinary(path: string): Promise<boolean> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).includes(0)
  }
  finally {
    await handle.close()
  }
}

/** One file (with its text when it is text and not too big) or one folder (with what is in it, folders first). */
export async function readEntry(real: string, root = filesRoot()): Promise<FileEntry> {
  const info = await stat(real)
  const rel = relative(realpathSync(root), real)
  const base = { path: real, relative: rel, name: basename(real) || basename(root), modified: info.mtime.toISOString() }
  if (info.isDirectory()) {
    const entries = (await readdir(real, { withFileTypes: true }))
      .filter(d => !d.name.startsWith('.') && (d.isDirectory() || d.isFile()) && !SECRET_NAME.test(d.name))
      .map(d => ({ name: d.name, path: join(real, d.name), kind: d.isDirectory() ? 'folder' as const : fileKind(d.name) }))
      .sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, undefined, { numeric: true }))
    return { ...base, kind: 'folder', size: 0, entries }
  }
  let kind = fileKind(real)
  if (kind === 'text' && await looksBinary(real)) kind = 'binary'
  if ((kind === 'text' || kind === 'markdown') && info.size <= TEXT_MAX) {
    const handle = await open(real, 'r')
    try {
      return { ...base, kind, size: info.size, content: await handle.readFile('utf8') }
    }
    finally {
      await handle.close()
    }
  }
  return { ...base, kind, size: info.size }
}
