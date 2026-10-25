<script setup lang="ts">
import type { InboxAttachment } from '#shared/types/inbox'

const route = useRoute()
const { data, error } = await useFetch<InboxAttachment>(`/api/inbox-attachment/${route.params.id}`)
useHead({ title: () => `${data.value?.title ?? 'Attachment'} · Repo Dashboard` })
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
        <pre class="whitespace-pre-wrap break-words font-mono text-sm">{{ data.content }}</pre>
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
