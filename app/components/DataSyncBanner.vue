<script setup lang="ts">
import { PDSExpCallout } from '@paqtdesign/experimental/vue'

// A warning (in the sticky AppHeader) while library-comparison's data sync needs a person: its data/jira.json or plans/ did not reach git.
interface SyncState { available: boolean, url: string, problem?: string | null, root?: string, unpushed?: number, pending?: number }

const state = ref<SyncState | null>(null)
async function load() {
  state.value = await $fetch<SyncState>('/api/data-sync').catch(() => state.value)
}
const description = computed(() => {
  const s = state.value
  if (!s) return ''
  const waiting = [
    s.unpushed ? `${s.unpushed} data commit${s.unpushed === 1 ? ' is' : 's are'} not pushed` : '',
    s.pending ? `${s.pending} data file${s.pending === 1 ? ' is' : 's are'} not committed` : '',
  ].filter(Boolean).join(', ')
  return `${waiting ? `${waiting}. ` : ''}Resolve it in ${s.root}; the sync retries every 5 minutes and this message goes away by itself.`
})

let timer: ReturnType<typeof setInterval> | undefined
function onVisible() {
  if (!document.hidden) void load()
}
onMounted(() => {
  void load()
  timer = setInterval(load, 30000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <div
    v-if="state?.available && state.problem"
    class="border-b border-border bg-surface px-4 py-2 sm:px-8"
    data-testid="data-sync-banner"
  >
    <PDSExpCallout
      color="danger"
      appearance="subtle"
      icon="lucide:git-branch"
      callout-role="alert"
      :heading="`library-comparison: ${state.problem}`"
      :description="description"
    >
      <template #actions>
        <a
          :href="state.url"
          target="_blank"
          rel="noopener"
          class="underline"
        >Open library-comparison</a>
      </template>
    </PDSExpCallout>
  </div>
</template>
