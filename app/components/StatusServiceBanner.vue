<script setup lang="ts">
import { PDSExpCallout } from '@paqtdesign/experimental/vue'

// A banner while the lss-tools status service is down or unhealthy: the inbox, loops and session data come from it. Its
// watchdog (paqt-health) restarts it within minutes; this makes sure an outage is visible, not a quietly empty page.
const health = ref<{ ok: boolean, problems: string[] } | null>(null)
async function load() {
  health.value = await $fetch<{ ok: boolean, problems: string[] }>('/api/status-health').catch(() => ({ ok: false, problems: ['the dashboard cannot reach its own server'] }))
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(load, 30000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div
    v-if="health && !health.ok"
    class="border-b border-border bg-surface px-4 py-2 sm:px-8"
    data-testid="status-service-banner"
  >
    <PDSExpCallout
      color="danger"
      appearance="subtle"
      icon="lucide:server-crash"
      callout-role="alert"
      heading="The status service is not well: inbox, loops and sessions may be out of date"
      :description="`${health.problems.join('; ')}. Its watchdog restarts it within a few minutes and reports it in the inbox.`"
    />
  </div>
</template>
