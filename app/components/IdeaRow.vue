<script setup lang="ts">
import type { LabFeedback, LabIdea } from '#shared/types/lab'

/**
 * One backlog idea with Ricardo's controls: his rating (next to research's), "Not now", "Reject" and context for the PO. All of it
 * goes to the PO as feedback (POST /api/lab-feedback), which applies it; until then the row shows it as "being applied".
 */
const props = defineProps<{ idea: LabIdea, feedback: LabFeedback[], kindLabel?: string | undefined }>()
const emit = defineEmits<{ changed: [] }>()

type Mode = null | 'not-now' | 'reject' | 'note'
const mode = ref<Mode>(null)
const text = ref('')
const sending = ref(false)
const error = ref<string | null>(null)

const mine = computed(() => props.feedback.filter(f => f.target_id === props.idea.id))
const open = computed(() => mine.value.filter(f => f.status !== 'applied'))
const applied = computed(() => mine.value.filter(f => f.status === 'applied' && f.applied_note).at(-1))
// What the stars show: a rating he just gave (not applied yet), else his applied rating, else nothing (research's is shown apart).
const myRating = computed(() => open.value.filter(f => f.kind === 'rating').at(-1)?.value ?? props.idea.ricardoValue ?? undefined)

async function send(kind: 'rating' | 'not-now' | 'reject' | 'note', extra: { value?: number, text?: string } = {}) {
  sending.value = true
  error.value = null
  try {
    await $fetch('/api/lab-feedback', { method: 'POST', body: { idea: props.idea.id, kind, ...extra }, headers: { 'X-LSS-Action': '1' } })
    mode.value = null
    text.value = ''
    emit('changed')
  }
  catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message
  }
  finally {
    sending.value = false
  }
}
function onRating(event: Event) {
  const value = Number((event as CustomEvent<{ value?: number }>).detail?.value ?? (event.target as HTMLInputElement | null)?.value)
  if (value >= 1 && value <= 5 && value !== myRating.value) void send('rating', { value })
}
const LABEL = { 'rating': 'rating', 'not-now': 'not now', 'reject': 'rejected', 'note': 'context' } as const
const describe = (f: LabFeedback) => (f.kind === 'rating' ? `${f.value} stars` : LABEL[f.kind]) + (f.text ? `: "${f.text}"` : '')
</script>

<template>
  <li
    class="flex flex-col gap-2 px-5 py-3.5 text-sm"
    :data-testid="`idea-${idea.id}`"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="font-semibold">{{ idea.title }}</span>
      <span class="text-foreground-muted">{{ idea.repo }}<template v-if="kindLabel"> · {{ kindLabel }}</template></span>
      <PDSBadge
        v-if="idea.status !== 'ready'"
        size="sm"
        appearance="subtle"
        :color="idea.status === 'next' ? 'info' : idea.status === 'doing' ? 'success' : undefined"
      >
        {{ idea.status }}
      </PDSBadge>
    </div>
    <p class="text-foreground-muted">
      {{ idea.description }}
    </p>
    <p
      v-if="idea.note || idea.dependsOn?.length"
      class="text-xs text-foreground-muted"
    >
      <template v-if="idea.note">
        {{ idea.note }}
      </template><template v-if="idea.dependsOn?.length">
        · after: {{ idea.dependsOn.join(', ') }}
      </template>
    </p>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span
        class="whitespace-nowrap text-xs text-foreground-muted"
        :title="`Research rated it ${idea.value} of 5`"
      >Research {{ '★'.repeat(idea.value) }}</span>
      <span class="flex items-center gap-2 text-xs text-foreground-muted">
        You
        <PDSRating
          :value="myRating"
          :max="5"
          :show-label="false"
          size="sm"
          :aria-label="`Your rating for ${idea.title}`"
          :disabled="sending || undefined"
          @pds-rating-change="onRating"
        />
      </span>
      <span class="ml-auto flex flex-wrap gap-2">
        <PDSButton
          size="sm"
          appearance="outlined"
          :disabled="sending"
          @click="mode = mode === 'not-now' ? null : 'not-now'"
        >Not now</PDSButton>
        <PDSButton
          size="sm"
          appearance="outlined"
          color="danger"
          :disabled="sending"
          @click="mode = mode === 'reject' ? null : 'reject'"
        >Reject</PDSButton>
        <PDSButton
          size="sm"
          appearance="outlined"
          :disabled="sending"
          @click="mode = mode === 'note' ? null : 'note'"
        >Context</PDSButton>
      </span>
    </div>

    <form
      v-if="mode"
      class="flex flex-col gap-2"
      @submit.prevent="send(mode!, { text })"
    >
      <label class="text-xs text-foreground-muted">
        {{ mode === 'note' ? 'Context for the product owner' : mode === 'reject' ? 'Why never (optional, helps research)' : 'Why not now (optional)' }}
        <textarea
          v-model="text"
          rows="2"
          class="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground"
        />
      </label>
      <span class="flex gap-2">
        <PDSButton
          size="sm"
          :color="mode === 'reject' ? 'danger' : 'brand'"
          type="submit"
          :disabled="sending || (mode === 'note' && !text.trim())"
        >{{ mode === 'note' ? 'Send to the PO' : mode === 'reject' ? 'Reject: never anything like it' : 'Not now' }}</PDSButton>
        <PDSButton
          size="sm"
          appearance="plain"
          @click="mode = null"
        >Cancel</PDSButton>
      </span>
    </form>

    <p
      v-if="open.length"
      class="text-xs text-info-text"
      role="status"
    >
      Your feedback ({{ open.map(describe).join(' · ') }}) {{ open.some(f => f.status === 'delivered') ? 'is with the product owner' : 'goes to the product owner shortly' }}.
    </p>
    <p
      v-else-if="applied"
      class="text-xs text-success-text"
    >
      Product owner: {{ applied.applied_note }}
    </p>
    <p
      v-if="error"
      role="alert"
      class="text-xs text-danger-text"
    >
      {{ error }}
    </p>
  </li>
</template>
