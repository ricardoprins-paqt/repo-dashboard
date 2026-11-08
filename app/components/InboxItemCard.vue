<script setup lang="ts">
import type { InboxItem, InboxTask } from '#shared/types/inbox'

const props = defineProps<{
  item: InboxItem
  task: InboxTask
  busy: boolean
  /** The task's session runs a loop with a backlog (the lab PO): offer "add to backlog" instead of doing it now. */
  canBacklog?: boolean
  /** The focus card this item belongs to, if any. */
  cardTitle?: string | null
}>()
const emit = defineEmits<{
  answer: [answer: string, backlog: boolean]
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
const itemAttachments = computed(() => (props.task.attachments ?? []).filter(a => a.item_id === props.item.id))
const backlog = ref(false)
const answerable = computed(() => props.item.kind === 'decision' || props.item.kind === 'question' || props.item.options.length > 0)
const waitingForDelivery = computed(() => props.item.status === 'answered')

function anchorLabel(a: InboxItem['anchors'][number]) {
  if (a.type === 'pr' && a.url) return a.url.replace(/^https:\/\/github\.com\/[^/]+\//, '').replace('/pull/', '#')
  if (a.type === 'branch') return `${a.repo ? `${a.repo}: ` : ''}${a.name ?? ''}`
  return a.path ?? a.url ?? a.type
}
function send() {
  if (!text.value.trim()) return
  emit('answer', text.value.trim(), backlog.value)
  text.value = ''
}
</script>

<template>
  <PDSCard
    :id="`I-${item.id}`"
    appearance="outlined"
    class="inbox-anchor"
    :color="item.severity === 'critical' ? 'danger' : undefined"
    :data-testid="`inbox-item-${item.id}`"
  >
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <div class="flex flex-wrap items-center gap-2">
          <PDSBadge
            v-if="item.severity === 'critical'"
            size="sm"
            appearance="solid"
            color="danger"
          >
            Critical
          </PDSBadge>
          <PDSBadge
            size="sm"
            appearance="subtle"
            :color="KIND[item.kind]?.color"
          >
            {{ KIND[item.kind]?.label ?? item.kind }}
          </PDSBadge>
          <a
            :href="`#I-${item.id}`"
            class="font-mono text-xs font-semibold text-foreground-muted hover:text-foreground"
            :title="`Link to this card (I-${item.id})`"
          >I-{{ item.id }}</a>
          <span class="ml-auto text-xs text-foreground-muted"><RelativeTime :at="item.created" /></span>
        </div>
        <h3 class="font-semibold">
          <LinkedText :text="item.title" />
        </h3>
        <p class="text-xs text-foreground-muted">
          Session {{ task.session ?? '?' }} · {{ task.title }}<template v-if="cardTitle">
            · card: <NuxtLink
              to="/focus"
              class="underline"
            >{{ cardTitle }}</NuxtLink>
          </template>
        </p>
      </div>
      <p
        v-if="item.body"
        class="max-w-prose whitespace-pre-line text-sm"
      >
        <LinkedText
          :text="item.body"
          :paths="item.paths"
        />
      </p>
      <p
        v-if="itemAttachments.length"
        class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
      >
        <NuxtLink
          v-for="a in itemAttachments"
          :key="a.id"
          :to="`/attachments/${a.id}`"
          class="font-semibold underline"
        >A-{{ a.id }} {{ a.title }}</NuxtLink>
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
          <NuxtLink
            v-else-if="a.resolved"
            :to="fileHref(a.resolved)"
            class="wrap-anywhere font-mono text-xs underline"
          >{{ anchorLabel(a) }}</NuxtLink>
          <span
            v-else
            class="font-mono text-xs text-foreground-muted"
            :title="a.type === 'file' ? 'Not found in the workspace' : undefined"
          >{{ anchorLabel(a) }}</span>
        </template>
      </p>

      <p
        v-if="waitingForDelivery"
        class="text-sm text-foreground-muted"
      >
        You answered: <strong><LinkedText :text="item.answer" /></strong><template v-if="item.backlog">
          (add to backlog)
        </template>. Waiting until a session can take it.
      </p>
      <template v-else>
        <div
          v-if="answerable"
          class="flex flex-col gap-2"
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
              @click="emit('answer', option, backlog)"
            >
              {{ option }}
            </PDSButton>
          </div>
          <label
            v-if="canBacklog"
            class="flex items-center gap-2 text-sm"
          >
            <input
              v-model="backlog"
              type="checkbox"
            >
            Add it to the backlog instead of doing it now
          </label>
          <form
            class="flex gap-2"
            @submit.prevent="send"
          >
            <input
              v-model="text"
              class="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-1.5 text-base sm:text-sm"
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
        <div class="flex flex-wrap gap-2">
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
            Remind me tomorrow
          </PDSButton>
        </div>
      </template>
    </div>
  </PDSCard>
</template>
