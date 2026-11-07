<script setup lang="ts">
import type { ResearchPlan } from '#shared/types/research'

/** A run plan of the research loop: rendered, with Approve / Reject (and a comment). No experiment runs without an approval. */
const props = defineProps<{ plan: ResearchPlan, busy: boolean }>()
const emit = defineEmits<{ decide: [decision: 'approve' | 'reject', comment: string] }>()

const html = computed(() => renderMarkdown(props.plan.content))
const comment = ref('')
const confirming = ref<'approve' | 'reject' | null>(null)
const noBudget = computed(() => props.plan.meta.budgetPoints == null)
const stale = computed(() => props.plan.decision && !props.plan.decision.current)

function decide() {
  if (!confirming.value) return
  emit('decide', confirming.value, comment.value.trim())
  confirming.value = null
}
</script>

<template>
  <PDSCard
    appearance="outlined"
    :data-testid="`plan-${plan.file}`"
  >
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 class="text-base font-semibold">
          {{ plan.title }}
        </h3>
        <span class="font-mono text-xs text-foreground-muted">{{ plan.file }}</span>
        <PDSBadge
          v-if="plan.decision"
          size="sm"
          :color="stale ? 'warning' : plan.decision.status === 'approved' ? 'success' : 'danger'"
        >
          {{ stale ? 'changed after your decision' : plan.decision.status }}
        </PDSBadge>
      </div>
      <p class="text-sm text-foreground-muted">
        Budget: {{ plan.meta.budgetPoints ?? '?' }} points of the weekly limit
        <template v-if="plan.meta.validFrom || plan.meta.validUntil">
          · valid {{ plan.meta.validFrom ?? '?' }} to {{ plan.meta.validUntil ?? '?' }}
        </template>
      </p>
      <p
        v-if="stale"
        class="text-sm text-warning-text"
      >
        This plan changed after you {{ plan.decision?.status }} it: approve again for it to count.
      </p>
      <p
        v-if="plan.decision && !stale"
        class="text-sm text-foreground-muted"
      >
        {{ plan.decision.status === 'approved' ? 'Approved' : 'Rejected' }} <RelativeTime :at="plan.decision.at" /><template v-if="plan.decision.comment">
          : {{ plan.decision.comment }}
        </template>
      </p>
      <details :open="!plan.decision || stale || undefined">
        <summary class="cursor-pointer text-sm font-semibold">
          The plan
        </summary>
        <!-- eslint-disable vue/no-v-html -- markdown-it with html: false escapes all raw HTML (app/utils/markdown.ts) -->
        <div
          class="markdown mt-2 text-sm"
          v-html="html"
        />
        <!-- eslint-enable vue/no-v-html -->
      </details>
      <template v-if="!plan.decision || stale">
        <PDSTextarea
          v-model="comment"
          :rows="2"
          label="Comment (optional)"
        />
        <p
          v-if="noBudget"
          class="text-sm text-danger-text"
        >
          This plan has no budget points, so it cannot be approved. Ask the loop to add them.
        </p>
        <div
          v-if="!confirming"
          class="flex flex-wrap justify-end gap-2"
        >
          <PDSButton
            appearance="outlined"
            color="danger"
            :disabled="busy"
            @click="confirming = 'reject'"
          >
            Reject
          </PDSButton>
          <PDSButton
            appearance="solid"
            color="brand"
            :disabled="busy || noBudget"
            @click="confirming = 'approve'"
          >
            Approve
          </PDSButton>
        </div>
        <div
          v-else
          class="flex flex-wrap items-center justify-end gap-2 text-sm"
        >
          {{ confirming === 'approve' ? `Approve this plan? Its runs may then use up to ${plan.meta.budgetPoints} points.` : 'Reject this plan?' }}
          <PDSButton
            size="sm"
            :color="confirming === 'approve' ? 'brand' : 'danger'"
            :disabled="busy"
            @click="decide"
          >
            {{ confirming === 'approve' ? 'Yes, approve' : 'Yes, reject' }}
          </PDSButton>
          <PDSButton
            size="sm"
            appearance="outlined"
            @click="confirming = null"
          >
            Cancel
          </PDSButton>
        </div>
      </template>
    </div>
  </PDSCard>
</template>
