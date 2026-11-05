<script setup lang="ts">
/**
 * Plain text with its web links, workspace file paths and inbox item references (I-374, to that card on /inbox) clickable
 * (app/utils/links.ts). Keep `whitespace-pre-line` on the parent where line breaks matter.
 */
const props = defineProps<{
  text: string | null | undefined
  paths?: Record<string, string> | undefined
}>()

const parts = computed(() => linkParts(props.text ?? '', props.paths))
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
    <NuxtLink
      v-else-if="'item' in part"
      :to="itemHref(part.item)"
      class="font-mono underline"
    >{{ part.text }}</NuxtLink>
    <template v-else>
      {{ part.text }}
    </template>
  </template>
</template>
