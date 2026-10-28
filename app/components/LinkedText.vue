<script setup lang="ts">
/** Plain text with its web links and workspace file paths clickable (app/utils/links.ts). Keep `whitespace-pre-line` on the parent. */
const props = defineProps<{
  text: string
  paths?: Record<string, string> | undefined
}>()

const parts = computed(() => linkParts(props.text, props.paths))
</script>

<template>
  <template
    v-for="(part, i) in parts"
    :key="i"
  >
    <a
      v-if="'url' in part"
      :href="part.url"
      target="_blank"
      rel="noopener noreferrer"
      class="wrap-anywhere underline"
    >{{ part.text }}</a>
    <NuxtLink
      v-else-if="'file' in part"
      :to="fileHref(part.file)"
      class="wrap-anywhere underline"
    >{{ part.text }}</NuxtLink>
    <template v-else>
      {{ part.text }}
    </template>
  </template>
</template>
