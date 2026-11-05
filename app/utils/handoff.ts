import { itemHref, linkParts } from './links'

/**
 * A task's handoff is short markdown written by the summarizer: escape it, then allow **bold**, `code`, bullets, web links and
 * inbox item references (I-374, to that card). Returns HTML for v-html; every piece of text is escaped first.
 */
export function renderHandoff(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const format = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>')
  const inline = (text: string) => linkParts(text).map((part) => {
    if ('url' in part) return `<a class="underline" href="${esc(part.url)}" target="_blank" rel="noopener">${esc(part.text)}</a>`
    if ('item' in part) return `<a class="font-mono underline" href="${itemHref(part.item)}">${esc(part.text)}</a>`
    return format(part.text)
  }).join('')
  return md.split('\n').map(line => (/^\s*[-*] /.test(line)
    ? `<span class="block pl-4 -indent-3">• ${inline(line.replace(/^\s*[-*] /, ''))}</span>`
    : `<span class="block">${inline(line)}</span>`)).join('')
}
