import { LinkifyIt } from 'linkify-it'

const linkify = new LinkifyIt()

export type TextPart = { text: string } | { text: string, url: string } | { text: string, file: string }

/** `/files` link for a path in the workspace. */
export const fileHref = (path: string) => `/files?path=${encodeURIComponent(path)}`

/**
 * Splits plain text into text, web links (full URLs and bare domains such as github.com/...) and file paths that the server
 * found in the workspace (`paths`: the text as written, and where it is). Where both match, the one that starts first wins.
 */
export function linkParts(text: string, paths: Record<string, string> = {}): TextPart[] {
  const matches: Array<{ start: number, end: number, part: TextPart }> = []
  for (const m of linkify.match(text) ?? []) {
    matches.push({ start: m.index, end: m.lastIndex, part: { text: m.raw, url: m.url } })
  }
  for (const [written, file] of Object.entries(paths)) {
    for (let at = text.indexOf(written); at !== -1; at = text.indexOf(written, at + written.length)) {
      matches.push({ start: at, end: at + written.length, part: { text: written, file } })
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  const parts: TextPart[] = []
  let pos = 0
  for (const m of matches) {
    if (m.start < pos) continue
    if (m.start > pos) parts.push({ text: text.slice(pos, m.start) })
    parts.push(m.part)
    pos = m.end
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) })
  return parts
}
