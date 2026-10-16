<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  value: number | string
  hint?: string
  tone?: 'danger' | 'warning' | 'success' | 'neutral'
  active?: boolean
  loading?: boolean
}>(), {
  hint: '',
  tone: 'neutral',
  active: false,
  loading: false,
})

defineEmits<{ select: [] }>()

const toneClass = {
  danger: 'text-danger',
  warning: 'text-[oklch(0.5_0.14_80)]',
  success: 'text-success',
  neutral: 'text-foreground',
}
</script>

<template>
  <button
    type="button"
    class="flex flex-col items-start gap-1 rounded-surface border bg-surface p-4 text-left transition-colors hover:border-border-strong"
    :class="active ? 'border-foreground' : 'border-border'"
    :aria-pressed="active"
    @click="$emit('select')"
  >
    <span class="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{{ label }}</span>
    <span
      class="text-3xl font-semibold leading-none tabular-nums"
      :class="toneClass[tone]"
    >
      <span
        v-if="loading"
        class="inline-block h-7 w-8 animate-pulse rounded bg-neutral-muted"
        aria-label="Loading"
      />
      <template v-else>{{ value }}</template>
    </span>
    <span
      v-if="hint"
      class="text-xs text-foreground-muted"
    >{{ hint }}</span>
  </button>
</template>
