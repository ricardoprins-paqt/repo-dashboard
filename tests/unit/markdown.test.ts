import { describe, expect, it } from 'vitest'
import { isMarkdown, renderMarkdown } from '../../app/utils/markdown'

describe('renderMarkdown', () => {
  it('renders GitHub tables, fenced code and task lists', () => {
    const html = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst x = 1\n```\n\n- [ ] open\n- [x] done\n')
    expect(html).toContain('<div class="table-scroll"><table>')
    expect(html).toContain('<code class="language-ts">const x = 1')
    expect(html).toContain('<li class="task-list-item"><input class="task-list-item-checkbox" disabled="" type="checkbox"> open</li>')
    expect(html).toContain('<li class="task-list-item"><input class="task-list-item-checkbox" checked="" disabled="" type="checkbox"> done</li>')
  })

  it('escapes raw HTML and drops script links', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))')
    expect(html).not.toMatch(/<script|<img/)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('href="javascript:')
  })

  it('opens links in a new tab without an opener', () => {
    expect(renderMarkdown('[x](https://example.com)')).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>')
  })

  it('leaves a literal [x] outside a list item alone', () => {
    expect(renderMarkdown('[x] not a task')).not.toContain('checkbox')
  })
})

describe('isMarkdown', () => {
  it('trusts a .md or other file name', () => {
    expect(isMarkdown('plan.md', 'just text')).toBe(true)
    expect(isMarkdown('notes.markdown', 'just text')).toBe(true)
    expect(isMarkdown('run.log', '# not a heading')).toBe(false)
    expect(isMarkdown('data.json', '- x')).toBe(false)
  })

  it('looks at the content when the title is in words', () => {
    expect(isMarkdown('State machine diagrams', '# Title\n\ntext')).toBe(true)
    expect(isMarkdown('Options', 'Intro.\n\n1. First\n2. Second')).toBe(true)
    expect(isMarkdown('Report', 'Plain sentence without structure.')).toBe(false)
    expect(isMarkdown('Report', '{"a": [1, 2]}')).toBe(false)
  })
})
