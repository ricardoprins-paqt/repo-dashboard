<script setup lang="ts">
import { PDSExpCollapsible } from '@paqtdesign/experimental/vue'
import type { LabExperiment, LabFeedback, LabReview } from '#shared/types/lab'

/**
 * Ricardo's verdict on an experiment, folded away until he wants it: Like (the PO has the PR reviewed by a fresh session, up to
 * three rounds, then asks him about opening it) or Reject (PR closed, out of lab/main, rejected.md), with optional text.
 */
const props = defineProps<{ experiment: LabExperiment, feedback: LabFeedback[], review?: LabReview | null | undefined }>()

const REVIEW_SAYS: Record<LabReview['status'], string> = {
  'queued': 'waiting for a reviewer',
  'review-1': 'first review',
  'fix-1': 'fixing the first findings',
  'review-2': 'second review',
  'fix-2': 'fixing the second findings',
  'review-3': 'third (last) review',
  'clean': 'found nothing: your decision is in the inbox',
  'raised': 'still findings after three reviews: your decision is in the inbox',
  'ready': 'done: ready for review',
  'rejected': 'stopped',
}
const emit = defineEmits<{ changed: [] }>()

const text = ref('')
const { sending, error, open, applied, openText, send, verdict, note, choiceText } = useLabFeedback('experiment', () => props.experiment.id, () => props.feedback, () => emit('changed'))
// Show the note that has not gone out yet, so he can change it (sending again replaces it).
watch(note, (n) => {
  if (n && n.status === 'pending' && !text.value) text.value = n.text
}, { immediate: true })

async function act(kind: 'like' | 'reject' | 'note') {
  // A note stays in the field (he may refine it); a verdict clears it.
  if (await send(kind, { text: text.value.trim() }) && kind !== 'note') text.value = ''
}
</script>

<template>
  <p
    v-if="review && review.status !== 'rejected'"
    class="text-xs text-info-text"
    :data-testid="`review-status-${experiment.id}`"
  >
    AI review (R-{{ review.id }}): {{ REVIEW_SAYS[review.status] }}<template v-if="review.session">
      · session {{ review.session }}
    </template>
  </p>
  <PDSExpCollapsible
    v-else
    :label="open.length ? 'Your verdict (being handled)' : 'Like or reject'"
    :data-testid="`review-${experiment.id}`"
  >
    <div class="flex flex-col gap-2 pt-2 text-sm">
      <PDSTextarea
        v-model="text"
        :rows="2"
        placeholder="Feedback to work into it, or a reason for Like or Reject"
        :aria-label="`Note about ${experiment.name}`"
      />
      <div class="flex flex-wrap gap-2">
        <PDSButton
          size="sm"
          :appearance="verdict?.kind === 'like' ? 'solid' : 'outlined'"
          color="success"
          :disabled="sending"
          @click="act('like')"
        >
          {{ verdict?.kind === 'like' ? 'Liked ✓' : 'Like: review it' }}
        </PDSButton>
        <PDSButton
          size="sm"
          appearance="outlined"
          :disabled="sending || !text.trim()"
          @click="act('note')"
        >
          {{ note ? 'Update feedback' : 'Feedback' }}
        </PDSButton>
        <PDSButton
          size="sm"
          :appearance="verdict?.kind === 'reject' ? 'solid' : 'outlined'"
          color="danger"
          :disabled="sending"
          @click="act('reject')"
        >
          {{ verdict?.kind === 'reject' ? 'Rejected ✓' : 'Reject' }}
        </PDSButton>
      </div>
      <p class="text-xs text-foreground-muted">
        Feedback: the product owner has it worked into the experiment; it stays open, so you like or reject it afterwards.
        Like: a fresh AI session reviews the PR (up to three rounds, with fixes in between); then you decide in your inbox whether it leaves draft.
      </p>
      <p
        v-if="openText"
        class="text-xs text-info-text"
        role="status"
      >
        {{ openText }} {{ choiceText }}
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
  </PDSExpCollapsible>
</template>
