<script setup lang="ts">
import type { ExperimentStatus, IdeaKind, LabFeedback, LabOverview } from '#shared/types/lab'

useHead({ title: 'Lab loop · Repo Dashboard' })

const { data, error, refresh } = await useFetch<LabOverview>('/api/lab')
// Ricardo's feedback on ideas, until the PO applied it (from the status service).
const { data: feedback, refresh: refreshFeedback } = await useFetch<LabFeedback[]>('/api/lab-feedback')

// The loop changes on its own (ticks, workers): keep the page current while it is open.
let timer: ReturnType<typeof setInterval> | undefined
function onVisible() {
  if (!document.hidden) void refresh()
}
onMounted(() => {
  timer = setInterval(() => {
    void refresh()
    void refreshFeedback()
  }, 30000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

const STATUS: Record<ExperimentStatus, { label: string, color?: 'success' | 'warning' | 'danger' | 'info' }> = {
  'in-lab-main': { label: 'In lab/main', color: 'info' },
  'needs-merge': { label: 'Needs merge', color: 'warning' },
  'liked': { label: 'Liked', color: 'success' },
  'rejected': { label: 'Rejected', color: 'danger' },
  'outside-lab-main': { label: 'Not in lab/main' },
}

const KIND: Record<IdeaKind, string> = { 'feature': 'Feature', 'ai-dx': 'AI / DX', 'gap': 'Competitor gap', 'challenge': 'Proposal' }

const fun = computed(() => data.value)

// Header menu: a tick or research now. The timer's checks still apply; the page shows what happened.
const running = ref<string | null>(null)
const notice = ref<{ ok: boolean, text: string } | null>(null)
const menuItems = computed(() => [
  { id: 'tick', label: running.value === 'tick' ? 'Running a tick…' : 'Run a tick now', icon: 'lucide:play', disabled: Boolean(running.value) },
  { id: 'research', label: running.value === 'research' ? 'Asking for research…' : 'Start research', icon: 'lucide:telescope', disabled: Boolean(running.value) || Boolean(fun.value?.research) },
])
async function onMenu(id: string) {
  running.value = id
  notice.value = null
  try {
    const r = await $fetch<{ ok: boolean, output: string }>('/api/inbox', { method: 'POST', body: { action: id === 'tick' ? 'loop-tick' : 'loop-research', loop: 'lab' }, headers: { 'X-LSS-Action': '1' } })
    // paqt-loop prints "lab: sent" or "lab: skipped (reason)".
    const out = r.output.replace(/^lab:\s*/, '')
    const sent = out.startsWith('sent')
    notice.value = { ok: sent, text: sent ? (id === 'tick' ? 'Tick sent to the product owner.' : 'Research requested; the product owner starts it now.') : `Not sent: ${out.replace(/^skipped\s*/, '').replace(/^\((.*)\)$/, '$1') || 'see the ticks below'}` }
    await refresh()
  }
  catch (e) {
    notice.value = { ok: false, text: (e as Error).message }
  }
  finally {
    running.value = null
  }
}
// By status (an experiment without a page, like an agent guide, has no preview link but is still in lab/main).
const inLabMain = computed(() => fun.value?.experiments.filter(e => e.inLabMain).length ?? 0)
const readyIdeas = computed(() => fun.value?.ideas.filter(i => (i.status === 'ready' || i.status === 'next') && (i.ricardoValue ?? i.value) >= (fun.value?.minStarsToBuild ?? 3)).length ?? 0)
const backlog = computed(() => fun.value?.ideas.filter(i => i.status !== 'parked') ?? [])
const parked = computed(() => fun.value?.ideas.filter(i => i.status === 'parked') ?? [])
const byRepo = computed(() => {
  const groups = new Map<string, LabOverview['experiments']>()
  for (const e of fun.value?.experiments ?? []) groups.set(e.repo, [...(groups.get(e.repo) ?? []), e])
  // Repos without anything in lab/main (paqt-ds-demo-healthcare) last.
  const live = (list: LabOverview['experiments']) => (list.some(e => e.inLabMain) ? 0 : 1)
  return [...groups.entries()].sort((a, b) => live(a[1]) - live(b[1]) || a[0].localeCompare(b[0]))
})
const nowLabel = computed(() => {
  const w = fun.value?.worker
  if (!w) return 'Idle'
  return `${w.branch ?? w.idea ?? 'Working'}`
})
const nowHint = computed(() => {
  const f = fun.value
  if (!f) return ''
  const parts = []
  if (f.worker?.startedAt) parts.push(`started ${relativeTime(f.worker.startedAt)}`)
  if (f.research?.startedAt) parts.push(`research running since ${relativeTime(f.research.startedAt)}`)
  return parts.join(' · ') || 'no worker running'
})
const nextLabel = computed(() => {
  const f = fun.value
  if (!f) return '–'
  if (f.paused) return 'Paused'
  return f.nextTickAt ? relativeTime(f.nextTickAt) : 'soon'
})
const everyLabel = computed(() => {
  const m = fun.value?.intervalMinutes ?? 60
  return m % 60 === 0 ? `every ${m / 60 === 1 ? 'hour' : `${m / 60} hours`}` : `every ${m} minutes`
})
// The timer runs every 5 minutes; much longer without a run means it stopped (or paqt-loop broke).
const timerStopped = computed(() => {
  const at = fun.value?.timerRanAt
  return Boolean(fun.value?.available) && (!at || Date.now() - Date.parse(at) > 15 * 60000)
})
const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="min-h-screen">
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-black focus:p-3 focus:text-white"
      href="#main-content"
    >Skip to content</a>

    <AppHeader
      title="Lab loop"
      :items="menuItems"
      @select="onMenu"
    >
      <template #subtitle>
        Session {{ fun?.session }} · {{ everyLabel }}<template v-if="fun?.pinnedAt">
          · develop pinned {{ fun.pinnedAt }}
        </template>
      </template>
    </AppHeader>

    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-4 py-8 sm:px-8"
    >
      <p
        v-if="notice"
        role="status"
        class="text-sm"
        :class="notice.ok ? 'text-success-text' : 'text-warning-text'"
      >
        {{ notice.text }}
      </p>
      <p
        v-if="error || (fun && !fun.available)"
        role="alert"
        class="text-danger-text"
      >
        Could not read the lab loop: {{ fun?.error ?? error?.message }}
      </p>

      <p
        v-if="timerStopped"
        role="alert"
        class="text-danger-text"
      >
        The timer has not run {{ fun?.timerRanAt ? `since ${relativeTime(fun.timerRanAt)}` : 'yet' }}: no ticks are sent.
        Check it with <code>systemctl --user status paqt-loop.service</code>.
      </p>

      <template v-if="fun?.available">
        <section aria-labelledby="now-heading">
          <h2
            id="now-heading"
            class="sr-only"
          >
            Now
          </h2>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <PDSCard appearance="outlined">
              <div class="flex flex-col gap-1">
                <span class="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Now</span>
                <span
                  class="truncate text-xl font-semibold"
                  data-testid="lab-now"
                >{{ nowLabel }}</span>
                <span class="text-xs text-foreground-muted">{{ nowHint }}</span>
              </div>
            </PDSCard>
            <PDSCard appearance="outlined">
              <div class="flex flex-col gap-1">
                <span class="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Next tick</span>
                <span
                  class="text-xl font-semibold"
                  :class="{ 'text-warning-text': fun.paused }"
                >{{ nextLabel }}</span>
                <span class="text-xs text-foreground-muted">last {{ relativeTime(fun.lastTickAt) }}</span>
              </div>
            </PDSCard>
            <PDSCard appearance="outlined">
              <div class="flex flex-col gap-1">
                <span class="text-xs font-semibold uppercase tracking-wide text-foreground-muted">In lab/main</span>
                <span class="text-3xl font-semibold leading-none tabular-nums">{{ inLabMain }}</span>
                <span class="text-xs text-foreground-muted">{{ fun.experiments.length }} experiments in total</span>
              </div>
            </PDSCard>
            <PDSCard appearance="outlined">
              <div class="flex flex-col gap-1">
                <span class="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Ideas ready</span>
                <span class="text-3xl font-semibold leading-none tabular-nums">{{ readyIdeas }}</span>
                <span class="text-xs text-foreground-muted">research {{ fun.lastResearchAt ? relativeTime(fun.lastResearchAt) : 'not run yet' }}</span>
              </div>
            </PDSCard>
          </div>
          <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span class="text-foreground-muted">Everything in lab/main:</span>
            <a
              v-for="p in fun.previews"
              :key="p.app"
              :href="p.url"
              target="_blank"
              rel="noopener"
              class="underline"
            >{{ p.app }}</a>
          </p>
        </section>

        <section
          v-for="[repo, experiments] in byRepo"
          :key="repo"
          :aria-labelledby="`repo-${repo}`"
          class="flex flex-col gap-3"
        >
          <h2
            :id="`repo-${repo}`"
            class="text-lg font-semibold"
          >
            {{ repo }}
          </h2>
          <ul class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <li
              v-for="e in experiments"
              :key="e.id"
              :data-testid="`experiment-${e.id}`"
            >
              <PDSCard
                appearance="outlined"
                class="h-full"
              >
                <div class="flex h-full flex-col gap-2">
                  <div class="flex items-start justify-between gap-2">
                    <h3 class="font-semibold">
                      {{ e.name }}
                    </h3>
                    <span class="flex shrink-0 gap-1">
                      <PDSBadge
                        v-if="e.kind && e.kind !== 'feature'"
                        size="sm"
                        appearance="subtle"
                      >
                        {{ KIND[e.kind] }}
                      </PDSBadge>
                      <PDSBadge
                        size="sm"
                        appearance="subtle"
                        :color="STATUS[e.status]?.color"
                      >
                        {{ STATUS[e.status]?.label ?? e.status }}
                      </PDSBadge>
                    </span>
                  </div>
                  <p class="text-sm">
                    {{ e.description }}
                  </p>
                  <p
                    v-if="e.note"
                    class="text-xs text-foreground-muted"
                  >
                    {{ e.note }}
                  </p>
                  <div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
                    <a
                      v-if="e.previewUrl"
                      :href="e.previewUrl"
                      target="_blank"
                      rel="noopener"
                      class="inline-flex items-center gap-1 font-semibold underline"
                    >
                      <PDSIcon
                        name="lucide:eye"
                        size="14"
                      />View
                    </a>
                    <a
                      :href="e.prUrl"
                      target="_blank"
                      rel="noopener"
                      class="inline-flex items-center gap-1 underline"
                    >
                      <PDSIcon
                        name="lucide:git-pull-request"
                        size="14"
                      />PR #{{ e.pr }}
                    </a>
                    <span class="ml-auto font-mono text-xs text-foreground-muted">{{ e.branch }}</span>
                  </div>
                </div>
              </PDSCard>
            </li>
          </ul>
        </section>

        <section
          v-if="fun.proposals.length"
          aria-labelledby="proposals-heading"
          class="flex flex-col gap-3"
        >
          <h2
            id="proposals-heading"
            class="text-lg font-semibold"
          >
            Proposals
          </h2>
          <ul class="grid gap-3 md:grid-cols-2">
            <li
              v-for="p in fun.proposals"
              :key="p.id"
            >
              <PDSCard
                appearance="outlined"
                class="h-full"
              >
                <div class="flex h-full flex-col gap-2">
                  <div class="flex items-start justify-between gap-2">
                    <h3 class="font-semibold">
                      {{ p.title }}
                    </h3>
                    <PDSBadge
                      size="sm"
                      appearance="subtle"
                      :color="p.status === 'accepted' ? 'success' : p.status === 'rejected' ? 'danger' : 'info'"
                    >
                      {{ p.status }}
                    </PDSBadge>
                  </div>
                  <p
                    v-if="p.recommendation"
                    class="text-sm"
                  >
                    {{ p.recommendation }}
                  </p>
                  <a
                    :href="p.url"
                    target="_blank"
                    rel="noopener"
                    class="mt-auto text-sm underline"
                  >Read the proposal</a>
                </div>
              </PDSCard>
            </li>
          </ul>
        </section>

        <section
          aria-labelledby="ideas-heading"
          class="flex flex-col gap-3"
        >
          <h2
            id="ideas-heading"
            class="text-lg font-semibold"
          >
            Backlog
          </h2>
          <p
            v-if="!backlog.length"
            class="text-sm text-foreground-muted"
          >
            No ideas yet: the first research run fills the backlog.
          </p>
          <ol
            v-else
            class="flex flex-col divide-y divide-border rounded border border-border bg-surface"
          >
            <IdeaRow
              v-for="i in backlog.slice(0, 30)"
              :key="i.id"
              :idea="i"
              :feedback="feedback ?? []"
              :kind-label="i.kind ? KIND[i.kind] : undefined"
              @changed="refreshFeedback()"
            />
          </ol>
          <details
            v-if="parked.length"
            class="text-sm"
          >
            <summary class="cursor-pointer text-foreground-muted">
              {{ parked.length }} parked (below {{ fun.minStarsToBuild }} stars, or "not now": never built; rate one up to bring it back)
            </summary>
            <ul class="mt-2 flex flex-col divide-y divide-border rounded border border-border bg-surface">
              <IdeaRow
                v-for="i in parked"
                :key="i.id"
                :idea="i"
                :feedback="feedback ?? []"
                :kind-label="i.kind ? KIND[i.kind] : undefined"
                @changed="refreshFeedback()"
              />
            </ul>
          </details>
        </section>

        <div class="grid gap-8 lg:grid-cols-2">
          <section
            aria-labelledby="runs-heading"
            class="flex flex-col gap-3"
          >
            <h2
              id="runs-heading"
              class="text-lg font-semibold"
            >
              What the product owner did
            </h2>
            <p
              v-if="!fun.runs.length"
              class="text-sm text-foreground-muted"
            >
              Nothing yet.
            </p>
            <ul
              v-else
              class="flex flex-col gap-1 text-sm"
            >
              <li
                v-for="r in fun.runs"
                :key="`${r.at}-${r.kind}`"
              >
                <span class="tabular-nums text-foreground-muted">{{ time(r.at) }}</span>
                · {{ r.kind }}<template v-if="r.branch || r.idea">
                  {{ r.branch ?? r.idea }}
                </template>: {{ r.result }}<template v-if="r.note">
                  ({{ r.note }})
                </template>
              </li>
            </ul>
          </section>
          <section
            aria-labelledby="ticks-heading"
            class="flex flex-col gap-3"
          >
            <h2
              id="ticks-heading"
              class="text-lg font-semibold"
            >
              Ticks
            </h2>
            <p
              v-if="!fun.ticks.length"
              class="text-sm text-foreground-muted"
            >
              No ticks yet.
            </p>
            <ul
              v-else
              class="flex flex-col gap-1 text-sm"
            >
              <li
                v-for="t in fun.ticks"
                :key="t.at"
              >
                <span class="tabular-nums text-foreground-muted">{{ time(t.at) }}</span>
                · <span :class="{ 'text-danger-text': t.result === 'error' }">{{ t.result }}</span><template v-if="t.reason">
                  : {{ t.reason }}
                </template><template v-else-if="t.message">
                  : {{ t.message.replace(/^\[[^\]]*\]\s*/, '') }}
                </template>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </main>
  </div>
</template>
