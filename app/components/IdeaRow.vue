<script setup lang="ts">
import type { LabFeedback, LabIdea } from '#shared/types/lab'

/**
 * One backlog idea as an accordion item: the title (with its rating) is the trigger; inside are the details, both ratings, a
 * text field and "Not now" / "Reject". Everything goes to the PO as feedback (useLabFeedback), which applies it. The text goes
 * with whatever Ricardo does next: a rating, Not now or Reject.
 */
const props = defineProps<{ idea: LabIdea, feedback: LabFeedback[], kindLabel?: string | undefined }>()
const emit = defineEmits<{ changed: [] }>()

const text = ref('')
const { sending, error, open, applied, openText, send } = useLabFeedback('idea', () => props.idea.id, () => props.feedback, () => emit('changed'))
// His rating: one he just gave (not applied yet), else the one the PO applied.
const myRating = computed(() => open.value.filter(f => f.kind === 'rating').at(-1)?.value ?? props.idea.ricardoValue ?? undefined)

async function act(kind: 'rating' | 'not-now' | 'reject', value?: number) {
  if (await send(kind, { ...(value ? { value } : {}), text: text.value.trim() })) text.value = ''
}
function onRating(event: Event) {
  const value = Number((event as CustomEvent<{ value?: number }>).detail?.value)
  if (value >= 1 && value <= 5 && value !== myRating.value) void act('rating', value)
}
</script>

<template>
  <PDSAccordionItem
    :name="idea.id"
    :data-testid="`idea-${idea.id}`"
  >
    <template #trigger>
      <span class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm">
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
        <span
          class="ml-auto whitespace-nowrap text-xs text-foreground-muted"
          :title="idea.ricardoValue ? `You: ${idea.ricardoValue} of 5, research: ${idea.value} of 5` : `Research: ${idea.value} of 5`"
        >{{ '★'.repeat(idea.ricardoValue ?? idea.value) }}<template v-if="idea.ricardoValue"> (yours)</template></span>
      </span>
    </template>

    <div class="flex flex-col gap-3 pb-2 text-sm">
      <p>{{ idea.description }}</p>
      <p
        v-if="idea.why"
        class="text-foreground-muted"
      >
        <span class="font-semibold">Why:</span> {{ idea.why }}
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

      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span class="flex items-center gap-2 text-xs text-foreground-muted">
          Research
          <PDSRating
            :value="idea.value"
            :max="5"
            :show-label="false"
            size="sm"
            disabled
            :aria-label="`Research's rating for ${idea.title}`"
          />
        </span>
        <span class="flex items-center gap-2 text-xs text-foreground-muted">
          You
          <PDSRating
            :value="myRating"
            :max="5"
            :show-label="false"
            size="sm"
            :disabled="sending || undefined"
            :aria-label="`Your rating for ${idea.title}`"
            @pds-rating-change="onRating"
          />
        </span>
      </div>

      <PDSTextarea
        v-model="text"
        :rows="2"
        placeholder="Context or reason for the product owner (optional; goes with your rating, Not now or Reject)"
        :aria-label="`Context or reason for ${idea.title}`"
      />
      <div class="flex flex-wrap gap-2">
        <PDSButton
          size="sm"
          appearance="outlined"
          :disabled="sending"
          @click="act('not-now')"
        >
          Not now
        </PDSButton>
        <PDSButton
          size="sm"
          appearance="outlined"
          color="danger"
          :disabled="sending"
          @click="act('reject')"
        >
          Reject: never anything like it
        </PDSButton>
      </div>

      <p
        v-if="openText"
        class="text-xs text-info-text"
        role="status"
      >
        {{ openText }}
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
    </div>
  </PDSAccordionItem>
</template>
