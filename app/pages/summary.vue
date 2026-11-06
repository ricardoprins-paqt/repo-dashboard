<script setup lang="ts">
import type { SummariesResponse } from '#shared/types/focus'

useHead({ title: 'FYI summary · Repo Dashboard' })

/** The daily FYI summaries: FYIs no longer show in the inbox; the assistant writes them up once a day. */
const { data } = await useFetch<SummariesResponse>('/api/summaries')
const summaries = computed(() => (data.value?.summaries ?? []).map(s => ({ ...s, html: renderMarkdown(s.content) })))
</script>

<template>
  <div class="min-h-screen">
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-black focus:p-3 focus:text-white"
      href="#main-content"
    >Skip to content</a>
    <AppHeader title="FYI summary">
      <template #subtitle>
        One summary a day of what you should know, written by the assistant
      </template>
    </AppHeader>
    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[60rem] flex-col gap-6 px-4 py-8 sm:px-8"
    >
      <p
        v-if="data && !data.available"
        role="alert"
        class="text-danger-text"
      >
        {{ data.error }}
      </p>
      <p
        v-else-if="!summaries.length"
        class="text-sm text-foreground-muted"
      >
        No summary yet. The assistant writes one a day.
      </p>
      <article
        v-for="s in summaries"
        :id="`summary-${s.date}`"
        :key="s.id"
        class="flex flex-col gap-2"
      >
        <h2 class="text-lg font-semibold">
          {{ new Date(s.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }}
        </h2>
        <!-- eslint-disable vue/no-v-html -- markdown-it with html: false escapes all raw HTML (app/utils/markdown.ts) -->
        <div
          class="markdown text-sm"
          v-html="s.html"
        />
        <!-- eslint-enable vue/no-v-html -->
        <p
          v-if="s.items.length"
          class="text-xs text-foreground-muted"
        >
          <LinkedText :text="`Covers ${s.items.map(i => `I-${i}`).join(', ')}.`" />
        </p>
      </article>
    </main>
  </div>
</template>
