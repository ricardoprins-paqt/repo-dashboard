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
  danger: 'text-danger-text',
  warning: 'text-warning-text',
  success: 'text-success-text',
  neutral: 'text-foreground',
}
</script>

<template>
  <!-- The label is a native button stretched over the whole tile, so the tile is one click target and one tab stop. -->
  <PDSCard
    class="card-interactive relative h-full"
    :class="{ 'card-selected': active }"
    appearance="outlined"
  >
    <div class="flex flex-col items-start gap-1">
      <button
        type="button"
        class="text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted outline-none after:absolute after:inset-0 after:content-['']"
        :aria-pressed="active"
        @click="$emit('select')"
      >
        {{ label }}
      </button>
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
    </div>
  </PDSCard>
</template>
