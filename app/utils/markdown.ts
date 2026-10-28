import MarkdownIt from 'markdown-it'
import linkAttributes from 'markdown-it-link-attributes'
import taskLists from 'markdown-it-task-lists'

/**
 * Attachments come from files agents write, so raw HTML is never passed through: `html: false`
 * escapes it, and markdown-it's own link check drops `javascript:`, `vbscript:` and most `data:` URLs.
 * Tables and fenced code are built in; the plugins add GitHub task lists (read-only checkboxes)
 * and open every link in a new tab without giving that tab a handle on this one.
 */
const md = new MarkdownIt({ html: false, linkify: true })
  .use(taskLists)
  .use(linkAttributes, { attrs: { target: '_blank', rel: 'noopener noreferrer' } })

// Tables sit in a box that scrolls sideways, so their columns keep a readable width on a phone.
md.renderer.rules.table_open = (tokens, idx, options, _env, self) => `<div class="table-scroll">${self.renderToken(tokens, idx, options)}`
md.renderer.rules.table_close = (tokens, idx, options, _env, self) => `${self.renderToken(tokens, idx, options)}</div>`

export function renderMarkdown(source: string): string {
  return md.render(source)
}

const OTHER_TEXT = /\.(json|log|txt|ya?ml|csv|diff|patch|xml|html?|[cm]?[jt]s)$/i
// A heading, a list, a fenced code block or a table row at the start of a line.
const MARKDOWN_SIGNS = /^(#{1,6} |\s*[-*+] |\s*\d+[.)] |```|~~~|\|.*\|\s*$)/m

/**
 * Whether an attachment is Markdown. Attachments have no content type, and many are titled
 * in words ("Options for ...") rather than with a file name, so a title without a known
 * extension falls back to the content: not JSON, and with some Markdown structure.
 */
export function isMarkdown(title: string, content: string): boolean {
  if (/\.(md|markdown)$/i.test(title)) return true
  if (OTHER_TEXT.test(title)) return false
  if (/^\s*[[{]/.test(content)) {
    try {
      JSON.parse(content)
      return false
    }
    catch { /* not JSON */ }
  }
  return MARKDOWN_SIGNS.test(content)
}
