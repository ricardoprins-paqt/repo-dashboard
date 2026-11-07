<script setup lang="ts">
import { PDSExpCallout } from '@paqtdesign/experimental/vue'
import type { ResearchResponse } from '#shared/types/research'

useHead({ title: 'Research · Repo Dashboard' })

/**
 * The research loop's page: what it is doing now, its questions for Ricardo (one at a time) and its run plans to approve.
 * The loop talks to him here, not in his inbox; answers and approvals are kept by the status service and delivered to the loop.
 */
const { data, refresh } = await useFetch<ResearchResponse>('/api/research')
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => void refresh(), 30000)
})
onBeforeUnmount(() => clearInterval(timer))

const view = computed(() => data.value?.view ?? null)
const loop = computed(() => view.value?.loop ?? null)
const state = computed(() => view.value?.state ?? {})
const questions = computed(() => splitQuestions(view.value?.questions ?? []))
const current = computed(() => questions.value.open[0] ?? null)
const plans = computed(() => groupPlans(view.value?.plans ?? []))
const heartbeat = computed(() => heartbeatState(view.value?.heartbeat?.ageMinutes))
const weekly = computed(() => highestWeekly(loop.value?.usage))
const currentPlan = computed(() => (view.value?.plans ?? []).find(p => p.file === state.value.currentPlan || p.title === state.value.currentPlan) ?? null)
const heartbeatColor = { none: '', ok: '', warn: 'text-warning-text', stalled: 'text-danger-text' } as const

const busy = ref(false)
const actionError = ref<string | null>(null)
async function post(url: string, body: Record<string, unknown>) {
  busy.value = true
  actionError.value = null
  try {
    await $fetch(url, { method: 'POST', body, headers: { 'X-LSS-Action': '1' } })
    await refresh()
    return true
  }
  catch (e) {
    actionError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message
    return false
  }
  finally {
    busy.value = false
  }
}
const answer = (text: string, choice: number | null) => post('/api/research/answer', { id: current.value?.id, text, ...(choice !== null ? { choice } : {}) })
const decide = (file: string, decision: 'approve' | 'reject', comment: string) => post('/api/research/plan', { file, decision, comment })
const confirmFence = ref(false)
async function acceptFence() {
  if (await post('/api/research/fence-accept', {})) confirmFence.value = false
}
</script>

<template>
  <div class="min-h-screen">
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-black focus:p-3 focus:text-white"
      href="#main-content"
    >Skip to content</a>
    <AppHeader title="Research">
      <template #subtitle>
        How PAQT writes code faster with AI without mistakes · session {{ loop?.session ?? '?' }}
      </template>
    </AppHeader>
    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[60rem] flex-col gap-8 px-4 py-8 sm:px-8"
    >
      <p class="text-sm text-foreground-muted">
        The research loop talks to you here, not in your inbox.
      </p>
      <p
        v-if="data && !data.available"
        role="alert"
        class="text-danger-text"
      >
        {{ data.error }}
      </p>
      <p
        v-if="actionError"
        role="alert"
        class="text-danger-text"
      >
        {{ actionError }}
      </p>

      <PDSExpCallout
        v-if="loop && !loop.fenceOk"
        appearance="subtle"
        color="danger"
        icon="lucide:shield-alert"
        heading="FENCE.md changed without your approval: the loop is paused"
        data-testid="fence-issue"
      >
        <template #description>
          <span class="flex flex-col gap-2 text-sm">
            <span>{{ loop.fenceIssue }}</span>
            <span
              v-if="!confirmFence"
              class="flex"
            >
              <PDSButton
                size="sm"
                color="danger"
                :disabled="busy"
                @click="confirmFence = true"
              >Accept the new FENCE.md</PDSButton>
            </span>
            <span
              v-else
              class="flex flex-wrap items-center gap-2"
            >
              Accept the current FENCE.md as the fence, and let the loop run again?
              <PDSButton
                size="sm"
                color="danger"
                :disabled="busy"
                @click="acceptFence"
              >Yes, accept it</PDSButton>
              <PDSButton
                size="sm"
                appearance="outlined"
                @click="confirmFence = false"
              >Cancel</PDSButton>
            </span>
          </span>
        </template>
      </PDSExpCallout>

      <section
        aria-labelledby="now-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="now-heading"
          class="text-lg font-semibold"
        >
          Now
        </h2>
        <dl
          v-if="view"
          class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]"
          data-testid="research-now"
        >
          <dt class="text-foreground-muted">
            Phase
          </dt>
          <dd>
            {{ state.phase ?? 'unknown' }}
            <span
              v-if="loop?.paused"
              class="text-warning-text"
            > · paused<template v-if="loop.pausedReason">: {{ loop.pausedReason }}</template></span>
          </dd>
          <dt class="text-foreground-muted">
            Experiments
          </dt>
          <dd>{{ state.currentExperiments?.length ? state.currentExperiments.join(', ') : 'none' }}</dd>
          <dt class="text-foreground-muted">
            Worker
          </dt>
          <dd>
            <template v-if="state.worker">
              session {{ state.worker.session }} on {{ state.worker.experiment }}, since <RelativeTime :at="state.worker.startedAt" />
            </template>
            <template v-else>
              none
            </template>
          </dd>
          <dt class="text-foreground-muted">
            Heartbeat
          </dt>
          <dd :class="heartbeatColor[heartbeat]">
            <template v-if="view.heartbeat">
              <RelativeTime :at="view.heartbeat.at" /><template v-if="heartbeat === 'stalled'">
                · stalled
              </template><template v-else-if="heartbeat === 'warn'">
                · quiet for {{ Math.round(view.heartbeat.ageMinutes) }} minutes
              </template>
            </template>
            <template v-else>
              no worker running
            </template>
          </dd>
          <dt class="text-foreground-muted">
            Last tick
          </dt>
          <dd>
            <template v-if="loop?.lastTick">
              <RelativeTime :at="loop.lastTick.at" /> · {{ loop.lastTick.result }}<template v-if="loop.lastTick.reason">
                : {{ loop.lastTick.reason }}
              </template>
            </template>
            <template v-else>
              none yet
            </template>
          </dd>
          <dt class="text-foreground-muted">
            Budget
          </dt>
          <dd>
            <template v-if="weekly">
              {{ weekly.label }} {{ weekly.percent }}% used (stops at 70%)
            </template>
            <template v-else>
              usage unknown
            </template>
            <template v-if="currentPlan">
              · the current plan may use {{ currentPlan.meta.budgetPoints ?? '?' }} points
            </template>
          </dd>
        </dl>
      </section>

      <section
        aria-labelledby="questions-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="questions-heading"
          class="text-lg font-semibold"
        >
          Questions
        </h2>
        <ResearchQuestionCard
          v-if="current"
          :question="current"
          :waiting="questions.open.length - 1"
          :busy="busy"
          @answer="answer"
        />
        <p
          v-else
          class="text-sm text-foreground-muted"
        >
          No questions waiting for you.
        </p>
        <details
          v-if="questions.answered.length"
          data-testid="answered-questions"
        >
          <summary class="cursor-pointer text-sm text-foreground-muted">
            Answered ({{ questions.answered.length }})
          </summary>
          <ul class="mt-2 flex flex-col gap-2 text-sm">
            <li
              v-for="q in questions.answered"
              :key="q.id"
            >
              <span class="font-mono text-xs">{{ q.id }}</span> {{ q.title }}:
              <span class="font-semibold">{{ q.answer?.text }}</span>
              <span class="text-xs text-foreground-muted">
                · answered <RelativeTime :at="q.answer?.at" />, {{ q.answer?.delivered_at ? 'delivered to the loop' : 'not delivered yet' }}
              </span>
            </li>
          </ul>
        </details>
      </section>

      <section
        aria-labelledby="plans-heading"
        class="flex flex-col gap-3"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="plans-heading"
            class="text-lg font-semibold"
          >
            Run plans
          </h2>
          <a
            href="/api/research/approvals.json"
            class="text-sm underline underline-offset-4"
            target="_blank"
          >approvals.json</a>
        </div>
        <p class="text-sm text-foreground-muted">
          No experiment runs without a plan you approved; editing an approved plan voids the approval.
        </p>
        <ResearchPlanCard
          v-for="p in plans.waiting"
          :key="p.file"
          :plan="p"
          :busy="busy"
          @decide="(decision, comment) => decide(p.file, decision, comment)"
        />
        <p
          v-if="!plans.waiting.length"
          class="text-sm text-foreground-muted"
        >
          No plan waiting for your decision.
        </p>
        <details v-if="plans.decided.length">
          <summary class="cursor-pointer text-sm text-foreground-muted">
            Decided ({{ plans.decided.length }})
          </summary>
          <div class="mt-2 flex flex-col gap-3">
            <ResearchPlanCard
              v-for="p in plans.decided"
              :key="p.file"
              :plan="p"
              :busy="busy"
              @decide="(decision, comment) => decide(p.file, decision, comment)"
            />
          </div>
        </details>
      </section>
    </main>
  </div>
</template>
