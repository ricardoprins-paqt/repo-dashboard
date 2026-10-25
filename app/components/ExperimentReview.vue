<script setup lang="ts">
import { PDSExpCollapsible } from '@paqtdesign/experimental/vue'
import type { LabExperiment, LabFeedback } from '#shared/types/lab'

/**
 * Ricardo's verdict on an experiment, folded away until he wants it: Like (the PO has the PR reviewed by a fresh session, up to
 * three rounds, then asks him about opening it) or Reject (PR closed, out of lab/main, rejected.md), with optional text.
 */
const props = defineProps<{ experiment: LabExperiment, feedback: LabFeedback[] }>()
const emit = defineEmits<{ changed: [] }>()

const text = ref('')
const { sending, error, open, applied, openText, send } = useLabFeedback('experiment', () => props.experiment.id, () => props.feedback, () => emit('changed'))

async function act(kind: 'like' | 'reject') {
  if (await send(kind, { text: text.value.trim() })) text.value = ''
}
</script>

<template>
  <PDSExpCollapsible
    :label="open.length ? 'Your verdict (being handled)' : 'Like or reject'"
    :data-testid="`review-${experiment.id}`"
  >
    <div class="flex flex-col gap-2 pt-2 text-sm">
      <PDSTextarea
        v-model="text"
        :rows="2"
        placeholder="Anything the product owner should know (optional)"
        :aria-label="`Note about ${experiment.name}`"
      />
      <div class="flex flex-wrap gap-2">
        <PDSButton
          size="sm"
          appearance="outlined"
          color="success"
          :disabled="sending"
          @click="act('like')"
        >
          Like: review it
        </PDSButton>
        <PDSButton
          size="sm"
          appearance="outlined"
          color="danger"
          :disabled="sending"
          @click="act('reject')"
        >
          Reject
        </PDSButton>
      </div>
      <p class="text-xs text-foreground-muted">
        Like: a fresh AI session reviews the PR (up to three rounds, with fixes in between); then you decide in your inbox whether it leaves draft.
      </p>
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
  </PDSExpCollapsible>
</template>
