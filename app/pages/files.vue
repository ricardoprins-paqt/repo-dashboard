<script setup lang="ts">
import type { FileEntry } from '#shared/types/files'

/** A file or folder in the workspace that an inbox item points to: Markdown formatted, images and PDFs shown, folders listed. */
const route = useRoute()
const path = computed(() => String(route.query.path ?? ''))
const { data, error } = await useFetch<FileEntry>('/api/files', { query: { path } })
useHead({ title: () => `${data.value?.name ?? 'File'} · Repo Dashboard` })

const raw = (p: string) => `/api/files/raw?path=${encodeURIComponent(p)}`

/** The folders above, each a link (from the workspace root down). */
const crumbs = computed(() => {
  const entry = data.value
  if (!entry?.relative) return []
  const parts = entry.relative.split('/')
  const base = entry.path.slice(0, entry.path.length - entry.relative.length).replace(/\/$/, '')
  return parts.slice(0, -1).map((name, i) => ({ name, path: `${base}/${parts.slice(0, i + 1).join('/')}` }))
})

const images = computed(() => data.value?.entries?.filter(e => e.kind === 'image') ?? [])
const others = computed(() => data.value?.entries?.filter(e => e.kind !== 'image') ?? [])

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="min-h-screen">
    <AppHeader :title="data ? data.name : 'File'">
      <template #subtitle>
        <template v-if="data">
          <template
            v-for="c in crumbs"
            :key="c.path"
          >
            <NuxtLink
              :to="fileHref(c.path)"
              class="hover:underline"
            >{{ c.name }}</NuxtLink> /
          </template>
          {{ data.name }}<template v-if="data.kind !== 'folder'">
            · {{ size(data.size) }}
          </template> · <RelativeTime :at="data.modified" />
        </template>
      </template>
    </AppHeader>
    <main class="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-8">
      <p
        v-if="error"
        role="alert"
        class="text-danger-text"
      >
        {{ error.statusMessage ?? error.message }}
      </p>
      <template v-else-if="data">
        <template v-if="data.kind === 'folder'">
          <p
            v-if="!data.entries?.length"
            class="text-sm text-foreground-muted"
          >
            This folder is empty.
          </p>
          <ul
            v-if="images.length"
            class="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4"
            :class="{ 'mb-8': others.length }"
          >
            <li
              v-for="e in images"
              :key="e.path"
            >
              <NuxtLink
                :to="fileHref(e.path)"
                class="group block"
              >
                <img
                  :src="raw(e.path)"
                  :alt="e.name"
                  loading="lazy"
                  class="aspect-[4/3] w-full rounded-control border border-border bg-surface object-contain group-hover:border-border-strong"
                >
                <span class="mt-1 block break-all text-xs group-hover:underline">{{ e.name }}</span>
              </NuxtLink>
            </li>
          </ul>
          <PDSCard
            v-if="others.length"
            appearance="outlined"
          >
            <ul class="flex flex-col gap-1 text-sm">
              <li
                v-for="e in others"
                :key="e.path"
              >
                <NuxtLink
                  :to="fileHref(e.path)"
                  class="wrap-anywhere underline"
                >{{ e.name }}{{ e.kind === 'folder' ? '/' : '' }}</NuxtLink>
              </li>
            </ul>
          </PDSCard>
        </template>
        <figure
          v-else-if="data.kind === 'image'"
          class="flex flex-col items-start gap-2"
        >
          <a
            :href="raw(data.path)"
            target="_blank"
            rel="noopener"
          >
            <img
              :src="raw(data.path)"
              :alt="data.name"
              class="max-h-[80vh] rounded-control border border-border bg-surface"
            >
          </a>
          <figcaption class="text-sm text-foreground-muted">
            Click the image to open it full size.
          </figcaption>
        </figure>
        <div
          v-else-if="data.kind === 'pdf'"
          class="flex flex-col gap-2"
        >
          <iframe
            :src="raw(data.path)"
            :title="data.name"
            class="h-[80vh] w-full rounded-control border border-border"
          />
          <a
            :href="raw(data.path)"
            target="_blank"
            rel="noopener"
            class="text-sm underline"
          >Open the PDF in a new tab</a>
        </div>
        <PDSCard
          v-else-if="data.content !== undefined"
          appearance="outlined"
        >
          <TextContent
            :name="data.name"
            :content="data.content"
          />
        </PDSCard>
        <p
          v-else
          class="text-sm"
        >
          {{ data.kind === 'binary' ? 'This file cannot be shown here.' : 'This file is too big to show here.' }}
          <a
            v-if="data.kind !== 'binary'"
            :href="raw(data.path)"
            target="_blank"
            rel="noopener"
            class="underline"
          >Open it as plain text</a>
        </p>
      </template>
      <p class="mt-4 text-sm">
        <NuxtLink
          to="/inbox"
          class="underline"
        >Back to the inbox</NuxtLink>
      </p>
    </main>
  </div>
</template>
