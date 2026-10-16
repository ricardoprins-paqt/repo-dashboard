<script setup lang="ts">
import type { Severity } from '#shared/types/repo'

defineProps<{ severity: Severity | null }>()

const icons = { critical: 'lucide:circle-x', warning: 'lucide:triangle-alert', info: 'lucide:info' } as const
const colors = { critical: 'text-danger', warning: 'text-[oklch(0.6_0.15_80)]', info: 'text-info' } as const
const labels = { critical: 'Critical', warning: 'Warning', info: 'Info' } as const
</script>

<template>
  <PDSIcon
    v-if="severity"
    :name="icons[severity]"
    :label="labels[severity]"
    size="16"
    :class="colors[severity]"
  />
  <PDSIcon
    v-else
    name="lucide:circle-check"
    label="All clear"
    size="16"
    class="text-success"
  />
</template>
