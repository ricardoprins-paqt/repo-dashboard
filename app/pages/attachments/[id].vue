<script setup lang="ts">
import type { InboxAttachment } from '#shared/types/inbox'

const route = useRoute()
const { data, error } = await useFetch<InboxAttachment>(`/api/inbox-attachment/${route.params.id}`)
useHead({ title: () => `${data.value?.title ?? 'Attachment'} · Repo Dashboard` })

const markdown = computed(() => (data.value?.content && isMarkdown(data.value.title, data.value.content) ? renderMarkdown(data.value.content) : null))
const raw = ref(false)
</script>

<template>
  <div class="min-h-screen">
    <AppHeader :title="data ? `A-${data.id} ${data.title}` : 'Attachment'">
      <template #subtitle>
        <template v-if="data">
          T-{{ data.task_id }}<template v-if="data.item_id">
            · I-{{ data.item_id }}
          </template> · {{ data.source }} · <RelativeTime :at="data.created" />
        </template>
      </template>
    </AppHeader>
    <main class="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-8">
      <p
        v-if="error"
        role="alert"
        class="text-danger-text"
      >
        {{ error.statusMessage ?? error.message }}
      </p>
      <PDSCard
        v-else-if="data"
        appearance="outlined"
      >
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
        >{{ data.content }}</pre>
      </PDSCard>
      <p class="mt-4 text-sm">
        <NuxtLink
          to="/inbox"
          class="underline"
        >Back to the inbox</NuxtLink>
      </p>
    </main>
  </div>
</template>
