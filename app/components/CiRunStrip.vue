<script setup lang="ts">
import type { CiRun } from '#shared/types/ci'

/** The last runs as a row of small bars, oldest on the left. Each bar links to its run; the summary is for screen readers. */
const props = defineProps<{ runs: CiRun[] }>()

const ordered = computed(() => [...props.runs].reverse())
const summary = computed(() => {
  const count = (state: CiRun['state']) => props.runs.filter(run => run.state === state).length
  return `Last ${props.runs.length} runs: ${count('success')} passed, ${count('failure')} failed, ${count('pending')} running, ${count('none')} cancelled or skipped`
})
</script>

<template>
  <div class="flex items-end gap-px">
    <span class="sr-only">{{ summary }}</span>
    <a
      v-for="run in ordered"
      :key="run.id"
      :href="run.url"
      target="_blank"
      rel="noopener"
      tabindex="-1"
      aria-hidden="true"
      :title="describeRun(run)"
      class="block w-1.5 rounded-[1px] hover:opacity-70"
      :class="[runStateClass[run.state], run.state === 'none' ? 'h-3' : 'h-5']"
    />
  </div>
</template>
