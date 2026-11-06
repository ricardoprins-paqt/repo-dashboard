<script setup lang="ts">
import type { CiExplanation } from '#shared/types/ci'

/**
 * "Why did this fail?" for one failed run. Asking takes 20-60 s (Claude reads the failing step's log); the answer is stored per
 * run, so the next click, here or in another tab, shows it at once. An opened explanation stays open after a reload (the run ids
 * are remembered in this browser); a newer failed run is another id, so its row starts closed again.
 */
const props = defineProps<{ runId: number, explained: boolean }>()

const explanation = ref<CiExplanation | null>(null)
const busy = ref(false)
const open = ref(false)
const error = ref<string | null>(null)

const OPEN_KEY = 'repo-dashboard:ci-open-explanations'
const KEEP = 200

function openIds(): number[] {
  try {
    const ids = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as unknown
    return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : []
  }
  catch {
    return []
  }
}

function rememberOpen(isOpen: boolean) {
  try {
    const ids = openIds().filter(id => id !== props.runId)
    if (isOpen) ids.push(props.runId)
    localStorage.setItem(OPEN_KEY, JSON.stringify(ids.slice(-KEEP)))
  }
  catch {
    // No storage (private window): it simply does not stay open after a reload.
  }
}

watch(open, rememberOpen)
onMounted(() => {
  if (props.explained && openIds().includes(props.runId)) void ask()
})

async function ask() {
  if (explanation.value) {
    open.value = !open.value
    return
  }
  busy.value = true
  error.value = null
  try {
    explanation.value = props.explained
      ? await $fetch<CiExplanation>(`/api/ci/runs/${props.runId}/explanation`)
      : await $fetch<CiExplanation>(`/api/ci/runs/${props.runId}/explanation`, { method: 'POST', headers: { 'X-LSS-Action': '1' } })
    open.value = true
  }
  catch (caught) {
    const data = (caught as { data?: { statusMessage?: string } }).data
    error.value = data?.statusMessage ?? (caught as Error).message
  }
  finally {
    busy.value = false
  }
}

const confidenceColor = { high: 'success', medium: 'warning', low: 'danger' } as const
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-3">
      <PDSButton
        size="sm"
        appearance="outlined"
        :loading="busy || undefined"
        :disabled="busy || undefined"
        @click="ask"
      >
        <PDSIcon
          name="lucide:sparkles"
          size="14"
        />
        {{ explanation && open ? 'Hide explanation' : explained || explanation ? 'Show AI explanation' : 'Why did this fail?' }}
      </PDSButton>
      <span
        class="text-xs text-foreground-muted"
        aria-live="polite"
      >
        <template v-if="busy && !explained">Claude is reading the failing step's log. This takes 20 to 60 seconds…</template>
      </span>
      <!-- The row's run strip, on the button's line, to the right. -->
      <div class="ml-auto">
        <slot />
      </div>
    </div>
    <p
      v-if="error"
      role="alert"
      class="text-sm text-danger-text"
    >
      Could not explain this run: {{ error }}
    </p>
    <section
      v-if="explanation && open"
      class="rounded-control border border-border bg-background p-4 text-sm"
      :aria-label="`AI explanation of run ${runId}`"
    >
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <PDSBadge
          color="info"
          appearance="subtle"
          size="sm"
        >
          AI explanation · check before acting
        </PDSBadge>
        <PDSBadge
          appearance="subtle"
          size="sm"
        >
          {{ failureKindLabel[explanation.kind] }}
        </PDSBadge>
        <PDSBadge
          :color="confidenceColor[explanation.confidence]"
          appearance="subtle"
          size="sm"
        >
          {{ explanation.confidence }} confidence
        </PDSBadge>
      </div>
      <dl class="grid gap-x-4 gap-y-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <template v-if="explanation.failed">
          <dt class="font-semibold">
            What failed
          </dt>
          <dd class="wrap-anywhere">
            {{ explanation.failed }}
          </dd>
        </template>
        <dt class="font-semibold">
          Likely cause
        </dt>
        <dd class="wrap-anywhere whitespace-pre-line">
          {{ explanation.cause }}
        </dd>
        <template v-if="explanation.fix">
          <dt class="font-semibold">
            Proposed fix
          </dt>
          <dd class="wrap-anywhere whitespace-pre-line">
            {{ explanation.fix }}
          </dd>
        </template>
        <dt class="font-semibold">
          How sure
        </dt>
        <dd>{{ explanation.confidenceReason || explanation.confidence }}</dd>
      </dl>
      <p class="mt-3 text-xs text-foreground-muted">
        Written by {{ explanation.model }} from the failing step's log, the workflow file and the commit, <RelativeTime :at="explanation.createdAt" />.
        Secrets are stripped before anything is sent. It can be wrong.
      </p>
    </section>
  </div>
</template>
