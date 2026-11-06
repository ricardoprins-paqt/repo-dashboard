<script setup lang="ts">
import type { FocusPr } from '#shared/types/focus'

/** One PR that waits for a human: repo#number, title, author, age, lane and checks. */
defineProps<{ pr: FocusPr }>()

const CHECKS: Record<FocusPr['checks'], { icon: string, label: string, cls: string }> = {
  success: { icon: 'lucide:circle-check', label: 'checks pass', cls: 'text-success-text' },
  failure: { icon: 'lucide:circle-x', label: 'checks fail', cls: 'text-danger-text' },
  pending: { icon: 'lucide:circle-dashed', label: 'checks running', cls: 'text-foreground-muted' },
  none: { icon: 'lucide:circle', label: 'no checks', cls: 'text-foreground-muted' },
}
</script>

<template>
  <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
    <PDSIcon
      :name="CHECKS[pr.checks].icon"
      :class="CHECKS[pr.checks].cls"
      :aria-label="CHECKS[pr.checks].label"
    />
    <a
      :href="pr.url"
      target="_blank"
      rel="noopener"
      class="font-mono text-xs underline"
    >{{ pr.repo }}#{{ pr.number }}</a>
    <span class="min-w-0">{{ pr.title }}</span>
    <span class="text-xs text-foreground-muted">by {{ pr.author }} · <RelativeTime :at="pr.created" /></span>
    <PDSBadge
      v-if="pr.lane"
      size="sm"
      appearance="subtle"
      :color="pr.lane === 'careful' ? 'warning' : 'info'"
    >
      lane: {{ pr.lane }}
    </PDSBadge>
    <span
      v-if="pr.reason === 'requested'"
      class="text-xs text-foreground-muted"
    >review requested from you</span>
  </div>
</template>
