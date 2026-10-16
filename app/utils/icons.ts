import lucide from '@iconify-json/lucide/icons.json'

/**
 * Every lucide icon the app can render. Add a name here when a template starts
 * using a new icon, so it works offline.
 */
export const APP_ICONS = [
  'circle-check',
  'circle-x',
  'cloud-download',
  'git-branch',
  'info',
  'moon',
  'refresh-cw',
  'sun',
  'triangle-alert',
] as const

/** Icons PDS components use internally (select, tabs, slideover, checkbox). */
export const PDS_INTERNAL_ICONS = ['check', 'chevron-down', 'chevron-left', 'chevron-right', 'x'] as const

export const LUCIDE_SIZE = { width: lucide.width, height: lucide.height }

export function lucideSubset(names: readonly string[]) {
  return Object.fromEntries(names.map(name => [name, lucide.icons[name as keyof typeof lucide.icons]]))
}
