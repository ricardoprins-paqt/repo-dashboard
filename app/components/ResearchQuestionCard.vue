<script setup lang="ts">
import type { ResearchQuestion } from '#shared/types/research'

/** One question from the research loop: its context, the options, the loop's recommendation as one click, or a typed answer. */
const props = defineProps<{ question: ResearchQuestion, waiting: number, busy: boolean }>()
const emit = defineEmits<{ answer: [text: string, choice: number | null] }>()

const choice = ref<string | undefined>(undefined)
const typed = ref('')
watch(() => props.question.id, () => {
  choice.value = undefined
  typed.value = ''
})

const context = computed(() => (props.question.context ? renderMarkdown(props.question.context) : null))
const items = computed(() => props.question.options.map((label, i) => ({ label, value: String(i) })))
const chosen = computed(() => (choice.value === undefined ? null : Number(choice.value)))
const text = computed(() => answerText(props.question, chosen.value, typed.value))
const kindColor: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = { decision: 'warning', question: 'info', canon: 'success', calibration: 'neutral' }

function submit() {
  if (text.value) emit('answer', text.value, chosen.value)
}
function goWithRecommendation() {
  if (props.question.recommendation) emit('answer', answerText(props.question, -1, typed.value), -1)
}
</script>

<template>
  <PDSCard
    appearance="outlined"
    :data-testid="`question-${question.id}`"
  >
    <form
      class="flex flex-col gap-3"
      @submit.prevent="submit"
    >
      <div class="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
        <PDSBadge
          size="sm"
          :color="kindColor[question.kind] ?? 'neutral'"
        >
          {{ question.kind }}
        </PDSBadge>
        <span class="font-mono">{{ question.id }}</span>
        <span v-if="question.experiment">· {{ question.experiment }}</span>
        <span
          v-if="waiting"
          class="ml-auto"
        >{{ waiting }} more waiting</span>
      </div>
      <h3 class="text-base font-semibold">
        {{ question.title }}
      </h3>
      <!-- eslint-disable vue/no-v-html -- markdown-it with html: false escapes all raw HTML (app/utils/markdown.ts) -->
      <div
        v-if="context"
        class="markdown text-sm"
        v-html="context"
      />
      <!-- eslint-enable vue/no-v-html -->
      <p
        v-if="question.blocks"
        class="text-xs text-foreground-muted"
      >
        Blocks: {{ question.blocks }}
      </p>
      <PDSRadioGroup
        v-if="items.length"
        v-model="choice"
        :items="items"
        label="Options"
        :name="`q-${question.id}`"
      />
      <div
        v-if="question.recommendation"
        class="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm"
      >
        <span><span class="font-semibold">The loop recommends:</span> {{ question.recommendation }}</span>
        <PDSButton
          size="sm"
          color="brand"
          type="button"
          class="ml-auto"
          :disabled="busy"
          @click="goWithRecommendation"
        >
          Go with the recommendation
        </PDSButton>
      </div>
      <PDSTextarea
        v-model="typed"
        :rows="3"
        label="Your answer"
        placeholder="Write your answer, or add to the option you chose"
      />
      <div class="flex justify-end">
        <PDSButton
          type="submit"
          appearance="solid"
          color="brand"
          :disabled="busy || !text"
        >
          Answer
        </PDSButton>
      </div>
    </form>
  </PDSCard>
</template>
