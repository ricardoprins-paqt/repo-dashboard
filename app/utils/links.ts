import { LinkifyIt } from 'linkify-it'

const linkify = new LinkifyIt()

export type TextPart = { text: string } | { text: string, url: string } | { text: string, file: string } | { text: string, item: number }

/** `/files` link for a path in the workspace. */
export const fileHref = (path: string) => `/files?path=${encodeURIComponent(path)}`

/** Link to an inbox item's card: `/inbox#I-374` (the card has that id; app/utils/inbox-anchor.ts scrolls to it). */
export const itemHref = (id: number) => `/inbox#I-${id}`

/** An inbox item reference as sessions write it: I-374 (not part of a longer word such as API-3). */
export const ITEM_REF = /(?<![\w-])I-(\d+)\b/g

/**
 * Splits plain text into text, web links (full URLs and bare domains such as github.com/...), inbox item references (I-374)
 * and file paths that the server found in the workspace (`paths`: the text as written, and where it is). Where two match,
 * the one that starts first wins, so an I-374 inside a URL stays part of the URL.
 */
export function linkParts(text: string, paths: Record<string, string> = {}): TextPart[] {
  const matches: Array<{ start: number, end: number, part: TextPart }> = []
  for (const m of linkify.match(text) ?? []) {
    matches.push({ start: m.index, end: m.lastIndex, part: { text: m.raw, url: m.url } })
  }
  for (const m of text.matchAll(ITEM_REF)) {
    matches.push({ start: m.index, end: m.index + m[0].length, part: { text: m[0], item: Number(m[1]) } })
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
