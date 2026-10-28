import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileKind, mimeType, resolveWorkspacePath } from '../../lib/files'

/**
 * `GET /api/files/raw?path=<path>`: the file itself, for images, PDFs and "open raw". Agents write these files, so nothing in
 * them may run on the dashboard's origin: everything but PDFs is sandboxed (an SVG or HTML file cannot run script), and
 * text is always served as plain text.
 */
export default defineEventHandler(async (event) => {
  assertLocalHost(event)
  const path = String(getQuery(event).path ?? '')
  const real = path ? resolveWorkspacePath(path) : null
  if (!real || !(await stat(real)).isFile()) throw createError({ statusCode: 404, statusMessage: `Not found in the workspace: ${path}` })
  const kind = fileKind(real)
  setResponseHeaders(event, {
    'Content-Type': kind === 'image' || kind === 'pdf' ? mimeType(real) : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
    'Content-Disposition': `inline; filename="${encodeURIComponent(basename(real))}"`,
    ...(kind === 'pdf' ? {} : { 'Content-Security-Policy': 'sandbox; default-src \'none\'; img-src \'self\' data:; style-src \'unsafe-inline\'' }),
  })
  return sendStream(event, createReadStream(real))
})
