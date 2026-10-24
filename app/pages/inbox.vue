<script setup lang="ts">
import type { InboxItem, InboxOverview, InboxTask, TaskStatus } from '#shared/types/inbox'

useHead({ title: 'Inbox · Repo Dashboard' })

const { theme, toggle: toggleTheme } = useTheme()
const { data, error, refresh } = await useFetch<InboxOverview>('/api/inbox')

let timer: ReturnType<typeof setInterval> | undefined
function onVisible() {
  if (!document.hidden) void refresh()
}
onMounted(() => {
  timer = setInterval(refresh, 20000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

const busy = ref(false)
const actionError = ref<string | null>(null)
async function act(body: Record<string, unknown>) {
  busy.value = true
  actionError.value = null
  try {
    await $fetch('/api/inbox', { method: 'POST', body, headers: { 'X-LSS-Action': '1' } })
    await refresh()
  }
  catch (e) {
    actionError.value = (e as Error).message
  }
  finally {
    busy.value = false
  }
}
const tomorrow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return d.toISOString().replace(/\.\d+Z$/, 'Z')
}

// Most urgent first: things only Ricardo can decide, then conflicts, reviews, FYIs; oldest first within a kind.
const KIND_ORDER = { decision: 0, question: 0, conflict: 1, review: 2, fyi: 3 } as const
const tasks = computed(() => data.value?.tasks ?? [])
const needsYou = computed(() => tasks.value
  .flatMap(task => task.items.map(item => ({ item, task })))
  .filter(({ item }) => item.status === 'open' || item.status === 'answered'
    || (item.status === 'snoozed' && (!item.snooze_until || Date.parse(item.snooze_until) <= Date.now())))
  .sort((a, b) => KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.item.created.localeCompare(b.item.created)))
const snoozed = computed(() => tasks.value.flatMap(t => t.items).filter(i => i.status === 'snoozed' && i.snooze_until && Date.parse(i.snooze_until) > Date.now()).length)

const STATUS: Record<TaskStatus, { label: string, color?: 'success' | 'warning' | 'info' | 'danger' }> = {
  working: { label: 'Working', color: 'info' },
  waiting: { label: 'Waiting for you', color: 'warning' },
  ready: { label: 'Ready to resume', color: 'info' },
  done: { label: 'Done', color: 'success' },
  dropped: { label: 'Dropped' },
}
const openTasks = computed(() => tasks.value.filter(t => t.status !== 'done' && t.status !== 'dropped'))
const closedTasks = computed(() => tasks.value.filter(t => t.status === 'done' || t.status === 'dropped'))
const openCount = (t: InboxTask) => t.items.filter((i: InboxItem) => i.status === 'open' || i.status === 'answered').length

// Session strip: what each session is on now.
const sessions = computed(() => (data.value?.sessions ?? []).map((s) => {
  const task = tasks.value.find(t => t.conversation && t.conversation === s.conversation)
  const reserved = data.value?.reserved.includes(s.n) ?? false
  const pinned = data.value?.pins.includes(s.n) ?? false
  const free = !reserved && !pinned && s.status === 'idle' && (!task || task.status === 'done' || task.status === 'dropped')
  return { ...s, task, reserved, pinned, free }
}))

// The handoff is short markdown: escape it, then allow **bold**, bullets and links.
function renderHandoff(md: string) {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a class="underline" href="$1" target="_blank" rel="noopener">$1</a>')
    .split('\n').map(l => (/^\s*[-*] /.test(l) ? `<span class="block pl-4 -indent-3">• ${l.replace(/^\s*[-*] /, '')}</span>` : `<span class="block">${l}</span>`)).join('')
}
</script>

<template>
  <div class="min-h-screen">
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-black focus:p-3 focus:text-white"
      href="#main-content"
    >Skip to content</a>

    <DataSyncBanner />

    <header class="border-b border-border bg-surface">
      <div class="mx-auto flex w-full max-w-[84rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-8">
        <NuxtLink
          to="/"
          class="flex shrink-0"
          aria-label="PAQT repo dashboard home"
        >
          <img
            class="dark:invert"
            src="/logo.svg"
            width="110"
            height="24"
            alt="PAQT"
          >
        </NuxtLink>
        <span
          class="hidden h-6 border-l border-border sm:block"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <h1 class="text-base font-semibold leading-tight">
            Inbox
          </h1>
          <p
            class="text-xs text-foreground-muted"
            aria-live="polite"
          >
            {{ needsYou.length }} need you · {{ openTasks.length }} open tasks<template v-if="snoozed">
              · {{ snoozed }} snoozed
            </template>
          </p>
        </div>
        <nav
          class="ml-auto flex flex-wrap items-center gap-4"
          aria-label="Pages"
        >
          <NuxtLink
            to="/"
            class="text-sm underline"
          >Repositories</NuxtLink>
          <NuxtLink
            to="/lab"
            class="text-sm underline"
          >Lab loop</NuxtLink>
          <PDSButton
            appearance="outlined"
            square
            @click="toggleTheme"
          >
            <PDSIcon
              :name="theme === 'dark' ? 'lucide:sun' : 'lucide:moon'"
              size="16"
            />
            <span class="sr-only">{{ theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode' }}</span>
          </PDSButton>
        </nav>
      </div>
    </header>

    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-4 py-8 sm:px-8"
    >
      <p
        v-if="error || (data && !data.available) || actionError"
        role="alert"
        class="text-danger-text"
      >
        {{ actionError ?? data?.error ?? error?.message }}
      </p>

      <section aria-labelledby="sessions-heading">
        <h2
          id="sessions-heading"
          class="mb-3 text-lg font-semibold"
        >
          Sessions
        </h2>
        <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <li
            v-for="s in sessions"
            :key="s.n"
            class="flex flex-col gap-1 rounded border border-border bg-surface p-3 text-sm"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold">{{ s.n }}</span>
              <span
                class="text-xs"
                :class="s.status === 'busy' ? 'text-info-text' : s.free ? 'text-success-text' : 'text-foreground-muted'"
              >{{ s.status === 'busy' ? 'busy' : s.reserved ? 'reserved' : s.pinned ? 'yours' : s.free ? 'free' : s.status }}</span>
            </div>
            <span class="line-clamp-2 text-xs text-foreground-muted">{{ s.task?.title ?? s.name ?? 'No task' }}</span>
            <button
              v-if="!s.reserved"
              type="button"
              class="self-start text-xs underline"
              :disabled="busy"
              :aria-pressed="s.pinned"
              @click="act({ action: 'pin', session: s.n, pinned: !s.pinned })"
            >
              {{ s.pinned ? 'Unpin' : 'Pin as mine' }}
            </button>
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="needs-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="needs-heading"
          class="text-lg font-semibold"
        >
          Needs you
        </h2>
        <p
          v-if="!needsYou.length"
          class="text-sm text-foreground-muted"
        >
          Nothing needs you right now.
        </p>
        <ul
          v-else
          class="grid gap-3 lg:grid-cols-2"
        >
          <li
            v-for="{ item, task } in needsYou"
            :key="item.id"
          >
            <InboxItemCard
              :item="item"
              :task="task"
              :busy="busy"
              @answer="answer => act({ action: 'answer', id: item.id, answer })"
              @close="act({ action: 'close', id: item.id })"
              @snooze="act({ action: 'snooze', id: item.id, until: tomorrow() })"
            />
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="tasks-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="tasks-heading"
          class="text-lg font-semibold"
        >
          Tasks
        </h2>
        <ul class="grid gap-3 lg:grid-cols-2">
          <li
            v-for="t in openTasks"
            :key="t.id"
            :data-testid="`task-${t.id}`"
          >
            <PDSCard
              appearance="outlined"
              class="h-full"
            >
              <div class="flex h-full flex-col gap-2">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-xs text-foreground-muted">
                      <span class="font-mono font-semibold text-foreground">T-{{ t.id }}</span>
                      · session {{ t.session ?? '?' }} · updated {{ relativeTime(t.updated) }}<template v-if="openCount(t)">
                        · {{ openCount(t) }} for you
                      </template>
                    </p>
                    <h3 class="font-semibold">
                      {{ t.title }}
                    </h3>
                  </div>
                  <PDSBadge
                    size="sm"
                    appearance="subtle"
                    :color="STATUS[t.status]?.color"
                  >
                    {{ STATUS[t.status]?.label ?? t.status }}
                  </PDSBadge>
                </div>
                <p
                  v-if="t.asked"
                  class="text-sm"
                >
                  <span class="text-foreground-muted">Asked:</span> {{ t.asked }}
                </p>
                <details class="text-sm">
                  <summary class="cursor-pointer text-foreground-muted">
                    Done, where, open
                  </summary>
                  <!-- eslint-disable vue/no-v-html -- renderHandoff escapes everything first -->
                  <div
                    class="mt-2 flex flex-col gap-0.5"
                    v-html="renderHandoff(t.handoff)"
                  />
                  <!-- eslint-enable vue/no-v-html -->
                </details>
                <p
                  v-if="t.next"
                  class="text-sm"
                >
                  <span class="text-foreground-muted">Next:</span> {{ t.next }}
                </p>
                <div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
                  <a
                    v-if="t.pr_url"
                    :href="t.pr_url"
                    target="_blank"
                    rel="noopener"
                    class="underline"
                  >Main PR</a>
                  <span
                    v-if="t.branch"
                    class="font-mono text-xs text-foreground-muted"
                  >{{ t.repo ? `${t.repo}: ` : '' }}{{ t.branch }}</span>
                  <button
                    type="button"
                    class="ml-auto text-xs underline"
                    :disabled="busy"
                    @click="act({ action: 'task-close', id: t.id, status: 'done' })"
                  >
                    Mark done
                  </button>
                </div>
              </div>
            </PDSCard>
          </li>
        </ul>
        <details
          v-if="closedTasks.length"
          class="text-sm"
        >
          <summary class="cursor-pointer text-foreground-muted">
            {{ closedTasks.length }} recently closed
          </summary>
          <ul class="mt-2 flex flex-col gap-1">
            <li
              v-for="t in closedTasks"
              :key="t.id"
            >
              T-{{ t.id }} · session {{ t.session }} · {{ t.title }} · {{ STATUS[t.status]?.label }}<template v-if="t.closed_note">
                ({{ t.closed_note }})
              </template>
            </li>
          </ul>
        </details>
      </section>
    </main>
  </div>
</template>
