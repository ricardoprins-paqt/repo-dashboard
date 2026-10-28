import type { FileEntry } from '#shared/types/files'
import { readEntry, resolveWorkspacePath } from '../../lib/files'

/** `GET /api/files?path=<path>`: a file in the workspace (with its text) or a folder (with what is in it). */
export default defineEventHandler(async (event): Promise<FileEntry> => {
  assertLocalHost(event)
  const path = String(getQuery(event).path ?? '')
  const real = path ? resolveWorkspacePath(path) : null
  if (!real) throw createError({ statusCode: 404, statusMessage: `Not found in the workspace: ${path}` })
  return await readEntry(real)
})
