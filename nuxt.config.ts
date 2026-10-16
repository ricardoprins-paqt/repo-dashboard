import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: [
    ['@paqtdesign/nuxt', { customTheme: '~/assets/css/theme.css' }],
    '@nuxt/eslint',
  ],
  devtools: { enabled: true },
  app: {
    head: {
      title: 'Repo Dashboard',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'description', content: 'Git and GitHub status of all local repositories.' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  css: [
    '@fontsource/ibm-plex-sans/400.css',
    '@fontsource/ibm-plex-sans/600.css',
    '~/assets/css/theme.css',
    '~/assets/css/tailwind.css',
  ],
  // @paqtdesign/nuxt only wires up @paqtdesign/vue. The experimental package imports
  // `@paqtdesign/core/tokens.css?inline`, which Node cannot resolve, so it has to be
  // bundled by Vite instead of loaded as an external, exactly like the module does for vue.
  build: {
    transpile: ['@paqtdesign/experimental'],
  },
  // Loopback only: the dashboard runs git and gh against local repos, so it must not be exposed on the network.
  devServer: { host: '127.0.0.1', port: 3178 },
  compatibilityDate: '2026-10-12',
  nitro: {
    externals: { inline: ['@paqtdesign/experimental'] },
  },
  vite: {
    plugins: [tailwindcss()],
    ssr: { noExternal: ['@paqtdesign/experimental'] },
    optimizeDeps: {
      exclude: ['@paqtdesign/vue', '@paqtdesign/experimental'],
    },
  },
  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
      },
    },
  },
  eslint: {
    config: {
      stylistic: {
        indent: 2,
        quotes: 'single',
        semi: false,
        commaDangle: 'always-multiline',
      },
    },
  },
})
