<script setup lang="ts">
/** "13 hours ago", with the exact date and time in a tooltip (on hover, and on keyboard focus). */
const props = defineProps<{ at: string | null | undefined }>()

const exact = computed(() => (props.at
  ? new Date(props.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'never'))
</script>

<template>
  <PDSTooltip
    :text="exact"
    placement="top"
  >
    <time
      :datetime="at ?? undefined"
      tabindex="0"
      class="cursor-help underline decoration-dotted underline-offset-2"
    >{{ relativeTime(at) }}</time>
  </PDSTooltip>
</template>
