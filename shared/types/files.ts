/** Files and folders in the workspace that inbox items point to, shown on `/files` (server/lib/files.ts). */

export type FileKind = 'markdown' | 'text' | 'image' | 'pdf' | 'binary' | 'folder'

export interface FolderEntry {
  name: string
  path: string
  kind: FileKind
}

export interface FileEntry {
  /** The real, absolute path. */
  path: string
  /** The path below the workspace root, for the header and breadcrumbs. */
  relative: string
  name: string
  kind: FileKind
  size: number
  modified: string
  /** Text and Markdown files up to 1 MB. */
  content?: string
  /** Folders: what is in them, folders first. */
  entries?: FolderEntry[]
}
