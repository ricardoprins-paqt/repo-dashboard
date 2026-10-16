import { addCollection } from 'iconify-icon'

/**
 * PDSIcon loads icons from api.iconify.design by default. Registering them here
 * keeps the dashboard working offline and avoids a request per icon.
 * This talks to iconify-icon directly: importing PDS's registerIconCollection would
 * define <pds-icon> first, which already starts the remote lookups.
 */
export default defineNuxtPlugin({
  name: 'local-icons',
  // Must run before the PDS components upgrade, or they ask the Iconify API first.
  enforce: 'pre',
  setup() {
    addCollection({
      prefix: 'lucide',
      ...LUCIDE_SIZE,
      icons: lucideSubset([...APP_ICONS, ...PDS_INTERNAL_ICONS]),
    })
  },
})
