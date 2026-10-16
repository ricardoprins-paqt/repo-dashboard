import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['.output/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
})
