<script setup lang="ts">
import type { Card, CardLink, FocusPr } from '#shared/types/focus'

/** One of Ricardo's focus cards: edit it, move it, focus or park it, ask the assistant for a plan, see its items and PRs. */
const props = defineProps<{
  card: Card
  items: Array<{ id: number, title: string }>
  prs: FocusPr[]
  first: boolean
  last: boolean
  busy: boolean
}>()
const emit = defineEmits<{
  update: [patch: Partial<Pick<Card, 'title' | 'note' | 'links' | 'status'>>]
  delete: []
  move: [by: -1 | 1]
  plan: []
}>()

const editing = ref(false)
const title = ref('')
const note = ref('')
const links = ref('')
const confirmDelete = ref(false)

const linksText = (list: CardLink[]) => list.map(l => (l.label && l.label !== l.url ? `${l.label} | ${l.url}` : l.url)).join('\n')
/** One link per line: "label | url", or just a URL or "org/repo". */
function parseLinks(text: string): CardLink[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map((line) => {
    const [a, b] = line.split('|').map(s => s.trim())
    return b ? { label: a ?? b, url: b } : { label: a ?? '', url: a ?? '' }
  })
}
function startEdit() {
  title.value = props.card.title
  note.value = props.card.note
  links.value = linksText(props.card.links)
  editing.value = true
}
function save() {
  if (!title.value.trim()) return
  emit('update', { title: title.value.trim(), note: note.value.trim(), links: parseLinks(links.value) })
  editing.value = false
}

const plan = computed(() => (props.card.plan ? renderMarkdown(props.card.plan) : null))
const pending = computed(() => planPending(props.card))
const isLink = (url: string) => /^https?:\/\//.test(url)
</script>

<template>
  <PDSCard
    appearance="outlined"
    :data-testid="`card-${card.id}`"
  >
    <div class="flex flex-col gap-3">
      <div
        v-if="!editing"
        class="flex flex-wrap items-start justify-between gap-2"
      >
        <div class="min-w-0">
          <h3 class="font-semibold">
            {{ card.title }}
          </h3>
          <p class="text-xs text-foreground-muted">
            Added <RelativeTime :at="card.created" />
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1">
          <PDSButton
            size="sm"
            appearance="outlined"
            :disabled="busy || first"
            :aria-label="`Move ${card.title} up`"
            @click="emit('move', -1)"
          >
            <PDSIcon name="lucide:arrow-up" />
          </PDSButton>
          <PDSButton
            size="sm"
            appearance="outlined"
            :disabled="busy || last"
            :aria-label="`Move ${card.title} down`"
            @click="emit('move', 1)"
          >
            <PDSIcon name="lucide:arrow-down" />
          </PDSButton>
          <PDSButton
            size="sm"
            appearance="outlined"
            :disabled="busy"
            @click="emit('update', { status: card.status === 'focused' ? 'parked' : 'focused' })"
          >
            {{ card.status === 'focused' ? 'Park' : 'Focus' }}
          </PDSButton>
          <PDSButton
            size="sm"
            appearance="outlined"
            :disabled="busy"
            @click="startEdit"
          >
            Edit
          </PDSButton>
        </div>
      </div>

      <form
        v-else
        class="flex flex-col gap-2"
        @submit.prevent="save"
      >
        <PDSInput
          v-model="title"
          aria-label="Title"
          placeholder="Title"
        />
        <PDSTextarea
          v-model="note"
          :rows="2"
          aria-label="Note"
          placeholder="Note (optional)"
        />
        <PDSTextarea
          v-model="links"
          :rows="2"
          aria-label="Links"
          placeholder="Links, one per line: a PR or repo URL, org/repo, or label | url"
        />
        <div class="flex flex-wrap gap-2">
          <PDSButton
            size="sm"
            color="brand"
            type="submit"
            :disabled="busy || !title.trim()"
          >
            Save
          </PDSButton>
          <PDSButton
            size="sm"
            appearance="outlined"
            type="button"
            @click="editing = false"
          >
            Cancel
          </PDSButton>
          <PDSButton
            v-if="!confirmDelete"
            size="sm"
            appearance="outlined"
            color="danger"
            type="button"
            class="ml-auto"
            @click="confirmDelete = true"
          >
            Delete card
          </PDSButton>
          <span
            v-else
            class="ml-auto flex items-center gap-2 text-sm"
          >
            Delete this card? Its inbox items stay.
            <PDSButton
              size="sm"
              color="danger"
              type="button"
              :disabled="busy"
              @click="emit('delete')"
            >Delete</PDSButton>
            <PDSButton
              size="sm"
              appearance="outlined"
              type="button"
              @click="confirmDelete = false"
            >Keep</PDSButton>
          </span>
        </div>
      </form>

      <p
        v-if="card.note && !editing"
        class="text-sm"
      >
        <LinkedText :text="card.note" />
      </p>
      <p
        v-if="card.links.length && !editing"
        class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
      >
        <template
          v-for="l in card.links"
          :key="l.url"
        >
          <a
            v-if="isLink(l.url)"
            :href="l.url"
            target="_blank"
            rel="noopener"
            class="underline"
          >{{ l.label || l.url }}</a>
          <span
            v-else
            class="font-mono text-xs"
          >{{ l.label || l.url }}</span>
        </template>
      </p>

      <div
        v-if="prs.length"
        class="flex flex-col gap-1 text-sm"
      >
        <p class="text-xs font-semibold text-foreground-muted">
          PRs waiting ({{ prs.length }})
        </p>
        <FocusPrRow
          v-for="pr in prs"
          :key="pr.url"
          :pr="pr"
        />
      </div>

      <p
        v-if="items.length"
        class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
      >
        <span class="text-foreground-muted">Inbox ({{ items.length }}):</span>
        <NuxtLink
          v-for="i in items"
          :key="i.id"
          :to="`/inbox#I-${i.id}`"
          class="underline"
          :title="i.title"
        >I-{{ i.id }}</NuxtLink>
      </p>

      <div class="flex flex-col gap-2 border-t border-border pt-2">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <PDSButton
            size="sm"
            appearance="outlined"
            :disabled="busy || pending"
            @click="emit('plan')"
          >
            {{ card.plan ? 'Make a new plan' : 'Make a plan' }}
          </PDSButton>
          <span
            v-if="pending"
            class="text-xs text-foreground-muted"
          >Plan requested <RelativeTime :at="card.plan_requested_at" />; the assistant (session 3) is on it.</span>
          <span
            v-else-if="card.plan_at"
            class="text-xs text-foreground-muted"
          >Plan from <RelativeTime :at="card.plan_at" /></span>
        </div>
        <!-- eslint-disable vue/no-v-html -- markdown-it with html: false escapes all raw HTML (app/utils/markdown.ts) -->
        <div
          v-if="plan"
          class="markdown text-sm"
          v-html="plan"
        />
        <!-- eslint-enable vue/no-v-html -->
      </div>
    </div>
  </PDSCard>
</template>
