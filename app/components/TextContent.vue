<script setup lang="ts">
/** A text file or attachment: Markdown formatted (with a raw-text toggle), anything else as it is. */
const props = defineProps<{
  name: string
  content: string
}>()

const markdown = computed(() => (isMarkdown(props.name, props.content) ? renderMarkdown(props.content) : null))
const raw = ref(false)
</script>

<template>
  <div>
    <div
      v-if="markdown"
      class="mb-4 flex justify-end"
    >
      <PDSButton
        size="sm"
        appearance="outlined"
        @click="raw = !raw"
      >
        {{ raw ? 'Show formatted' : 'Show raw text' }}
      </PDSButton>
    </div>
    <!-- eslint-disable vue/no-v-html -- markdown-it with html: false escapes all raw HTML (app/utils/markdown.ts) -->
    <div
      v-if="markdown && !raw"
      class="markdown"
      v-html="markdown"
    />
    <!-- eslint-enable vue/no-v-html -->
    <pre
      v-else
      class="whitespace-pre-wrap break-words font-mono text-sm"
    >{{ content }}</pre>
  </div>
</template>
