// These markdown-it plugins ship no types, and @types/markdown-it-link-attributes is written
// against @types/markdown-it 14, which clashes with the types markdown-it 15 ships itself.
declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it'

  const taskLists: PluginWithOptions<{ enabled?: boolean, label?: boolean, labelAfter?: boolean }>
  export default taskLists
}

declare module 'markdown-it-link-attributes' {
  import type { PluginWithOptions } from 'markdown-it'

  const linkAttributes: PluginWithOptions<{ attrs: Record<string, string>, matcher?: (href: string) => boolean }>
  export default linkAttributes
}
