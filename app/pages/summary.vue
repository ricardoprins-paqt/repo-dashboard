<script setup lang="ts">
import { PDSExpCollapsible } from '@paqtdesign/experimental/vue'
import type { AchievementsResponse, SummariesResponse } from '#shared/types/focus'

useHead({ title: 'Daily summary · Repo Dashboard' })

/**
 * The daily summary: what we achieved (the assistant writes it at 18:00 and adds to it at midnight: highlights, plus every
 * single thing folded away) and the FYI summaries (FYIs no longer show in the inbox). One big heading per day, smaller ones per part.
 */
const { data, refresh: refreshSummaries } = await useFetch<SummariesResponse>('/api/summaries')
const { data: achieved, refresh: refreshAchievements } = await useFetch<AchievementsResponse>('/api/achievements')
const refresh = () => Promise.all([refreshSummaries(), refreshAchievements()])
const days = computed(() => summaryDays(achieved.value?.achievements ?? [], data.value?.summaries ?? []).map(d => ({
  ...d,
  highlightsHtml: d.achievement ? renderMarkdown(d.achievement.highlights) : '',
  itemHtml: (d.achievement?.items ?? []).map(i => renderMarkdown(i)),
  fyis: d.fyis.map(f => ({ ...f, html: renderMarkdown(withoutLeadingH1(f.content)) })),
})))
const dayTitle = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

// "Write a summary" (in the header's menu): the assistant writes one now. Pending until a summary newer than the request exists.
const requesting = ref(false)
const requestError = ref<string | null>(null)
const pending = computed(() => {
  return summaryPending(data.value?.requested_at, data.value?.summaries ?? [], achieved.value?.achievements ?? [])
})
const menuItems = computed(() => [{ id: 'write-summary', label: requesting.value ? 'Asking the assistant…' : 'Write a summary', icon: 'lucide:file-pen-line', disabled: requesting.value }])
async function onMenu(id: string) {
  if (id !== 'write-summary') return
  requesting.value = true
  requestError.value = null
  try {
    await $fetch('/api/summaries/request', { method: 'POST', headers: { 'X-LSS-Action': '1' } })
    await refresh()
  }
  catch (e) {
    requestError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message
  }
  finally {
    requesting.value = false
  }
}
// While a summary is being written, look again every 20 seconds.
let timer: ReturnType<typeof setInterval> | undefined
watch(pending, (p) => {
  clearInterval(timer)
  if (p) timer = setInterval(() => void refresh(), 20000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="min-h-screen">
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-black focus:p-3 focus:text-white"
      href="#main-content"
    >Skip to content</a>
    <AppHeader
      title="Daily summary"
      :items="menuItems"
      @select="onMenu"
    >
      <template #subtitle>
        What we achieved, and what you should know
      </template>
    </AppHeader>
    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[60rem] flex-col gap-12 px-4 py-8 sm:px-8"
    >
      <p
        v-if="pending"
        role="status"
        class="text-sm text-foreground-muted"
      >
        The assistant is writing a summary (asked <RelativeTime :at="data?.requested_at" />); it shows here when it's ready.
      </p>
      <p
        v-if="requestError"
        role="alert"
        class="text-danger-text"
      >
        Could not ask the assistant: {{ requestError }}
      </p>
      <p
        v-if="data && !data.available"
        role="alert"
        class="text-danger-text"
      >
        {{ data.error }}
      </p>
      <p
        v-else-if="!days.length"
        class="text-sm text-foreground-muted"
      >
        No summary yet. The assistant writes one at 18:00 and adds to it at midnight.
      </p>
      <article
        v-for="(d, i) in days"
        :id="`summary-${d.date}`"
        :key="d.date"
        class="flex flex-col gap-8"
        :class="i ? 'border-t border-border pt-12' : ''"
      >
        <h2 class="text-2xl font-semibold tracking-[-0.01em]">
          {{ dayTitle(d.date) }}
        </h2>
        <section
          v-if="d.achievement"
          class="flex flex-col gap-4"
          :aria-label="`What we achieved on ${dayTitle(d.date)}`"
        >
          <h3 class="section-title">
            What we achieved
          </h3>
          <!-- eslint-disable vue/no-v-html -- markdown-it with html: false escapes all raw HTML (app/utils/markdown.ts) -->
          <div
            class="markdown markdown-nested text-sm"
            v-html="d.highlightsHtml"
          />
          <PDSExpCollapsible
            v-if="d.itemHtml.length"
            :label="`Everything done that day (${d.itemHtml.length})`"
          >
            <ul class="markdown flex list-disc flex-col gap-1 pl-5 pt-2 text-sm">
              <li
                v-for="(html, i) in d.itemHtml"
                :key="i"
                v-html="html"
              />
            </ul>
          </PDSExpCollapsible>
          <!-- eslint-enable vue/no-v-html -->
          <p class="text-xs text-foreground-muted">
            Covers until {{ timeOf(d.achievement.covered_until) }}
          </p>
        </section>
        <section
          v-if="d.fyis.length"
          class="flex flex-col gap-4"
          :aria-label="`FYI summary of ${dayTitle(d.date)}`"
        >
          <h3 class="section-title">
            FYI summary
          </h3>
          <div
            v-for="f in d.fyis"
            :key="f.id"
            class="flex flex-col gap-1"
          >
            <!-- eslint-disable vue/no-v-html -- markdown-it with html: false escapes all raw HTML (app/utils/markdown.ts) -->
            <div
              class="markdown markdown-nested text-sm"
              v-html="f.html"
            />
            <!-- eslint-enable vue/no-v-html -->
            <p
              v-if="f.items.length"
              class="text-xs text-foreground-muted"
            >
              <LinkedText :text="`Covers ${f.items.map(i => `I-${i}`).join(', ')}.`" />
            </p>
          </div>
        </section>
      </article>
    </main>
  </div>
</template>
