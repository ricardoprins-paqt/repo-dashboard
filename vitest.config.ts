import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

const nuxtAppDir = dirname(createRequire(import.meta.url).resolve('nuxt/app'))

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          clearMocks: true,
        },
      },
      await defineVitestProject({
        plugins: [{
          name: 'resolve-nuxt-test-entry-imports',
          enforce: 'pre',
          resolveId(source, importer) {
            if (source.startsWith('.') && importer?.endsWith('/nuxt-vitest-app-entry.js')) {
              return this.resolve(resolve(nuxtAppDir, source), undefined, { skipSelf: true })
            }
          },
        }],
        test: {
          name: 'nuxt',
          environment: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          clearMocks: true,
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
              overrides: {
                buildDir: fileURLToPath(new URL('./.nuxt/vitest', import.meta.url)),
                alias: { '#app': nuxtAppDir },
              },
            },
          },
        },
      }),
    ],
  },
})
