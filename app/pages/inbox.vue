<script setup lang="ts">
import type { InboxOverview, InboxTask, ItemKind, TaskStatus } from '#shared/types/inbox'

useHead({ title: 'Inbox · Repo Dashboard' })

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

// Header menu: close items whose PRs/branches are gone now, instead of at the next 5-minute check.
const checking = ref(false)
const checked = ref<string | null>(null)
async function checkNow() {
  checking.value = true
  try {
    const r = await $fetch<{ ok: boolean, output: string }>('/api/inbox', { method: 'POST', body: { action: 'check' }, headers: { 'X-LSS-Action': '1' } })
    checked.value = r.ok ? `Checked: ${r.output}.` : `The check failed: ${r.output}`
    await refresh()
  }
  catch (e) {
    checked.value = (e as Error).message
  }
  finally {
    checking.value = false
  }
}

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

const tasks = computed(() => data.value?.tasks ?? [])
const allNeedsYou = computed(() => tasks.value.flatMap(task => task.items.map(item => ({ item, task }))).filter(({ item }) => item.needs_you))

// Filters (which kinds) and sorting for "Needs you", remembered in this browser.
const PREFS_KEY = 'repo-dashboard:inbox'
const shownKinds = ref<Set<ItemKind>>(new Set(INBOX_KINDS.map(k => k.kind)))
const sort = ref<InboxSort>('kind')
const sortValue = computed<string>({
  get: () => sort.value,
  set: value => (sort.value = INBOX_SORTS.find(s => s.value === value)?.value ?? 'kind'),
})
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { kinds?: ItemKind[], sort?: InboxSort }
    if (Array.isArray(saved.kinds)) shownKinds.value = new Set(saved.kinds.filter(k => INBOX_KINDS.some(x => x.kind === k)))
    if (saved.sort && INBOX_SORTS.some(s => s.value === saved.sort)) sort.value = saved.sort
  }
  catch {
    // Storage can be blocked; the defaults are fine.
  }
})
watch([shownKinds, sort], () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ kinds: [...shownKinds.value], sort: sort.value }))
  }
  catch {
    // Not remembered this time.
  }
}, { deep: true })
// Click: only this kind (again: all). Cmd/ctrl-click: add or remove it.
function clickKind(kind: ItemKind, event: MouseEvent) {
  shownKinds.value = nextKinds(shownKinds.value, kind, event.metaKey || event.ctrlKey, INBOX_KINDS.map(k => k.kind))
}
const allShown = computed(() => shownKinds.value.size === INBOX_KINDS.length)
const kindCount = (kind: ItemKind) => allNeedsYou.value.filter(({ item }) => item.kind === kind).length
const needsYou = computed(() => needsYouList(allNeedsYou.value, shownKinds.value, sort.value))
const hiddenCount = computed(() => allNeedsYou.value.length - needsYou.value.length)
const snoozed = computed(() => tasks.value.flatMap(t => t.items).filter(i => i.status === 'snoozed' && i.snooze_until && Date.parse(i.snooze_until) > Date.now()).length)

const STATUS: Record<TaskStatus, { label: string, color?: 'success' | 'warning' | 'info' | 'danger' }> = {
  working: { label: 'Working', color: 'info' },
  waiting: { label: 'Waiting for you', color: 'warning' },
  ready: { label: 'Ready to resume', color: 'info' },
  parked: { label: 'Parked, waiting for you', color: 'warning' },
  done: { label: 'Done', color: 'success' },
  dropped: { label: 'Dropped' },
}
const openTasks = computed(() => tasks.value.filter(t => t.status !== 'done' && t.status !== 'dropped'))
const closedTasks = computed(() => tasks.value.filter(t => t.status === 'done' || t.status === 'dropped'))
const openCount = (t: InboxTask) => t.needs_you

// "Add to backlog" only makes sense for a task in a loop session that keeps a backlog (the status service says which).
const canBacklog = (task: InboxTask) => data.value?.sessions.some(s => s.n === task.session && s.backlog) ?? false

// Session strip: what each session is on now.
// Session strip: what each session is on now. Reserved, pinned, loop and free come from the status service.
const sessions = computed(() => (data.value?.sessions ?? []).map(s => ({ ...s, task: tasks.value.find(t => t.id === s.task_id) })))

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

    <AppHeader
      title="Inbox"
      :items="[{ id: 'check', label: checking ? 'Checking…' : 'Check for closed PRs now', icon: 'lucide:git-pull-request-closed', disabled: checking }]"
      @select="checkNow"
    >
      <template #subtitle>
        {{ allNeedsYou.length }} need you · {{ openTasks.length }} open tasks<template v-if="snoozed">
          · {{ snoozed }} snoozed
        </template>
      </template>
    </AppHeader>

    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-4 py-8 sm:px-8"
    >
      <p
        v-if="checked"
        role="status"
        class="text-sm text-foreground-muted"
      >
        {{ checked }}
      </p>
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
              >{{ s.status === 'busy' ? 'busy' : s.reserved ? 'reserved' : s.loop ? 'loop' : s.pinned ? 'yours' : s.free ? 'free' : s.status }}</span>
            </div>
            <span class="line-clamp-2 text-xs text-foreground-muted">{{ s.task?.title ?? s.name ?? 'No task' }}</span>
            <span
              v-for="a in s.activity"
              :key="a.kind"
              class="text-xs font-semibold text-info-text"
            >{{ a.kind === 'worker' ? `Worker: ${a.label}` : 'Research running' }}<template v-if="a.since">
              · <RelativeTime :at="a.since" />
            </template></span>
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
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="needs-heading"
            class="text-lg font-semibold"
          >
            Needs you
          </h2>
          <div class="w-56">
            <PDSSelect
              v-model="sortValue"
              :items="INBOX_SORTS"
              aria-label="Sort the items that need you"
            />
          </div>
        </div>
        <div
          class="flex flex-wrap gap-2"
          role="group"
          aria-label="Show these kinds"
        >
          <PDSButton
            v-for="k in INBOX_KINDS"
            :key="k.kind"
            size="sm"
            :appearance="shownKinds.has(k.kind) ? undefined : 'outlined'"
            :color="shownKinds.has(k.kind) ? 'brand' : undefined"
            @click="(event: MouseEvent) => clickKind(k.kind, event)"
          >
            {{ k.label }} ({{ kindCount(k.kind) }})<span
              v-if="!shownKinds.has(k.kind)"
              class="sr-only"
            > (hidden)</span>
          </PDSButton>
          <span class="self-center text-xs text-foreground-muted">
            {{ allShown ? 'Click a type to see only that one; ⌘/Ctrl-click to add another' : 'Click it again for all types · ⌘/Ctrl-click to add or remove one' }}
          </span>
        </div>
        <p
          v-if="!needsYou.length"
          class="text-sm text-foreground-muted"
        >
          {{ allNeedsYou.length ? `Nothing to show: ${hiddenCount} hidden by the filters above.` : 'Nothing needs you right now.' }}
        </p>
        <p
          v-if="needsYou.length && hiddenCount"
          class="text-xs text-foreground-muted"
        >
          {{ hiddenCount }} hidden by the filters above.
        </p>
        <ul
          v-if="needsYou.length"
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
              :can-backlog="canBacklog(task)"
              @answer="(answer: string, backlog: boolean) => act({ action: 'answer', id: item.id, answer, backlog })"
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
                      · session {{ t.session ?? '?' }} · updated <RelativeTime :at="t.updated" /><template v-if="openCount(t)">
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
