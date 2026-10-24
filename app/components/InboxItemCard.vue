<script setup lang="ts">
import type { InboxItem, InboxTask } from '#shared/types/inbox'

const props = defineProps<{ item: InboxItem, task: InboxTask, busy: boolean }>()
const emit = defineEmits<{
  answer: [answer: string]
  close: []
  snooze: []
}>()

const KIND = {
  decision: { label: 'Decision', color: 'warning' },
  question: { label: 'Question', color: 'warning' },
  conflict: { label: 'Conflict', color: 'danger' },
  review: { label: 'Review', color: 'info' },
  fyi: { label: 'FYI', color: undefined },
} as const

const text = ref('')
const answerable = computed(() => props.item.kind === 'decision' || props.item.kind === 'question' || props.item.options.length > 0)
const waitingForDelivery = computed(() => props.item.status === 'answered')

function anchorLabel(a: InboxItem['anchors'][number]) {
  if (a.type === 'pr' && a.url) return a.url.replace(/^https:\/\/github\.com\/[^/]+\//, '').replace('/pull/', '#')
  if (a.type === 'branch') return `${a.repo ? `${a.repo}: ` : ''}${a.name ?? ''}`
  return a.path ?? a.url ?? a.type
}
function send() {
  if (!text.value.trim()) return
  emit('answer', text.value.trim())
  text.value = ''
}
</script>

<template>
  <PDSCard
    appearance="outlined"
    :data-testid="`inbox-item-${item.id}`"
  >
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <PDSBadge
          size="sm"
          appearance="subtle"
          :color="KIND[item.kind]?.color"
        >
          {{ KIND[item.kind]?.label ?? item.kind }}
        </PDSBadge>
        <span class="text-xs text-foreground-muted">
          Session {{ task.session ?? '?' }} · {{ task.title }} · {{ relativeTime(item.created) }}
        </span>
      </div>
      <h3 class="font-semibold">
        {{ item.title }}
      </h3>
      <p
        v-if="item.body"
        class="whitespace-pre-line text-sm"
      >
        {{ item.body }}
      </p>
      <p
        v-if="item.anchors.length"
        class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
      >
        <template
          v-for="(a, i) in item.anchors"
          :key="i"
        >
          <a
            v-if="a.url"
            :href="a.url"
            target="_blank"
            rel="noopener"
            class="underline"
          >{{ anchorLabel(a) }}</a>
          <span
            v-else
            class="font-mono text-xs text-foreground-muted"
          >{{ anchorLabel(a) }}</span>
        </template>
      </p>

      <p
        v-if="waitingForDelivery"
        class="text-sm text-foreground-muted"
      >
        You answered: <strong>{{ item.answer }}</strong>. Waiting until a session can take it.
      </p>
      <template v-else>
        <div
          v-if="answerable"
          class="flex flex-col gap-2 pt-1"
        >
          <div
            v-if="item.options.length"
            class="flex flex-wrap gap-2"
          >
            <PDSButton
              v-for="option in item.options"
              :key="option"
              size="sm"
              appearance="outlined"
              :disabled="busy"
              @click="emit('answer', option)"
            >
              {{ option }}
            </PDSButton>
          </div>
          <form
            class="flex gap-2"
            @submit.prevent="send"
          >
            <input
              v-model="text"
              class="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-1.5 text-sm"
              :aria-label="`Your answer to: ${item.title}`"
              :placeholder="item.options.length ? 'Or write your own answer…' : 'Your answer…'"
            >
            <PDSButton
              size="sm"
              color="brand"
              type="submit"
              :disabled="busy || !text.trim()"
            >
              Send
            </PDSButton>
          </form>
        </div>
        <div class="flex flex-wrap gap-2 pt-1">
          <PDSButton
            size="sm"
            :appearance="answerable ? 'plain' : 'outlined'"
            :disabled="busy"
            @click="emit('close')"
          >
            {{ item.kind === 'fyi' ? 'Got it' : item.kind === 'review' ? 'Reviewed' : 'Done' }}
          </PDSButton>
          <PDSButton
            size="sm"
            appearance="plain"
            :disabled="busy"
            @click="emit('snooze')"
          >
            Tomorrow
          </PDSButton>
        </div>
      </template>
    </div>
  </PDSCard>
</template>
