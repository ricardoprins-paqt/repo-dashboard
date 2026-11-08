<script setup lang="ts">
import { PDSExpCallout } from '@paqtdesign/experimental/vue'
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
// Items held in a chat (held_since) are not shown anywhere; the status service already leaves them out of needs_you.
const allNeedsYou = computed(() => tasks.value.flatMap(task => task.items.map(item => ({ item, task }))).filter(({ item }) => item.needs_you && !item.held_since))

// Sessions that asked something in their chat that Ricardo hasn't answered there yet: one quiet line, no cards.
const waitingInChat = computed(() => data.value?.waitingInChat ?? [])
const waitingLine = computed(() => {
  const n = waitingInChat.value.map(w => w.session)
  if (!n.length) return ''
  if (n.length === 1) return `Session ${n[0]} is waiting for you in its chat`
  return `Sessions ${n.slice(0, -1).join(', ')} and ${n.at(-1)} are waiting for you in their chat`
})

// Focus: the default view shows the items of focused cards (Ricardo's /focus page) and critical items; items of parked cards and
// items on no card are folded under "Not now". FYIs are in the daily summary (/summary), not here.
const cards = computed(() => data.value?.cards ?? [])
const focusSplit = computed(() => splitByFocus(allNeedsYou.value, cards.value))
const hiddenFyis = computed(() => allNeedsYou.value.filter(({ item }) => hiddenAsFyi(item)).length)
const hasFocusedCards = computed(() => cards.value.some(c => c.status === 'focused'))
const notNowOpen = ref(false)
const cardTitle = (id: number | null | undefined) => (id == null ? null : cards.value.find(c => c.id === id)?.title ?? null)

// Filters (which kinds) and sorting for "Needs you", remembered in this browser. FYIs have no button: they are not shown here.
const KINDS = INBOX_KINDS.filter(k => k.kind !== 'fyi')
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
  const next = nextKinds(shownKinds.value, kind, event.metaKey || event.ctrlKey, KINDS.map(k => k.kind))
  next.add('fyi') // a critical FYI (something broken) always stays visible
  shownKinds.value = next
}
const allShown = computed(() => KINDS.every(k => shownKinds.value.has(k.kind)))
const visible = computed(() => [...focusSplit.value.now, ...focusSplit.value.notNow])
const kindCount = (kind: ItemKind) => visible.value.filter(({ item }) => item.kind === kind).length
const needsYou = computed(() => needsYouList(focusSplit.value.now, shownKinds.value, sort.value))
const notNow = computed(() => needsYouList(focusSplit.value.notNow, shownKinds.value, sort.value))
const hiddenCount = computed(() => visible.value.length - needsYou.value.length - notNow.value.length)
const snoozed = computed(() => tasks.value.flatMap(t => t.items).filter(i => i.status === 'snoozed' && i.snooze_until && Date.parse(i.snooze_until) > Date.now()).length)

// Links to a card (/inbox#I-374, from item text, handoffs, other pages): after the data is there, scroll it into view below
// the sticky header (.inbox-anchor), highlight it for a moment, and say why when it has no card on the page.
const route = useRoute()
const anchorNotice = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined
async function goToItem(hash: string) {
  const id = itemFromHash(hash)
  if (id === null || !data.value) return
  let found = locateItem(tasks.value, id, shownKinds.value)
  if (found.place === 'filtered') {
    shownKinds.value = new Set([...shownKinds.value, found.item.kind])
    found = { ...found, place: 'shown' }
  }
  anchorNotice.value = placeNotice(id, found)
  if (found.place !== 'shown') return
  if (focusSplit.value.notNow.some(e => e.item.id === id)) notNowOpen.value = true
  await nextTick()
  const card = document.getElementById(`I-${id}`)
  if (!card) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  card.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  card.classList.add('inbox-anchor-flash')
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => card.classList.remove('inbox-anchor-flash'), 2400)
}
function onHashChange() {
  void goToItem(window.location.hash)
}
onMounted(() => {
  void goToItem(route.hash)
  window.addEventListener('hashchange', onHashChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
  clearTimeout(flashTimer)
})
watch(() => route.hash, hash => void goToItem(hash))

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

// Session tiles: plain words for the session's state (the status service's terms are reserved/loop/pinned/free).
type SessionTile = { n: number, status: string, reserved?: boolean | undefined, loop?: boolean | undefined, pinned?: boolean | undefined, free?: boolean | undefined, name?: string | null | undefined, task?: { title?: string | null | undefined } | null | undefined }
function sessionLabel(s: SessionTile) {
  if (s.status === 'busy') return 'Working'
  if (s.reserved || s.loop) return 'Fixed role'
  if (s.pinned) return 'Kept for you'
  if (s.free) return 'Free'
  return s.status === 'not running' ? 'Not running' : 'Idle'
}
function sessionHint(s: SessionTile) {
  if (s.reserved || s.loop) return 'Has a fixed role (like the product owner or the assistant); never handed other work'
  if (s.pinned) return 'Kept for your own work; the inbox does not hand it other work'
  if (s.free) return 'Free: the inbox may hand it a waiting task'
  return ''
}
// The session's own name repeats its number ("6 - I-516 pr261 review"): show only the part after it.
function sessionTitle(s: SessionTile) {
  const own = s.task?.title && s.task.title !== 'Untitled task' ? s.task.title : ''
  const title = own || s.name?.replace(new RegExp(`^${s.n}\\s*-\\s*`), '') || ''
  return title || 'No task yet'
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
        {{ focusSplit.now.length }} need you now · {{ focusSplit.notNow.length }} not now · {{ openTasks.length }} open tasks<template v-if="snoozed">
          · {{ snoozed }} snoozed
        </template>
      </template>
    </AppHeader>

    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[84rem] flex-col gap-12 px-4 py-8 sm:px-8"
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

      <section
        aria-labelledby="sessions-heading"
        class="flex flex-col gap-4"
      >
        <h2
          id="sessions-heading"
          class="section-title"
        >
          Sessions
        </h2>
        <p class="-mt-2 text-sm text-foreground-muted">
          New work goes to a free session. Sessions kept for you or with a fixed role are never handed other work.
        </p>
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <li
            v-for="s in sessions"
            :key="s.n"
            class="flex flex-col gap-1 rounded-surface border border-border bg-surface p-3 text-sm"
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-semibold">Session {{ s.n }}</span>
              <span
                class="text-xs"
                :class="s.status === 'busy' ? 'text-info-text' : s.free ? 'text-success-text' : 'text-foreground-muted'"
                :title="sessionHint(s)"
              >{{ sessionLabel(s) }}</span>
            </div>
            <span class="line-clamp-2 text-xs text-foreground-muted"><LinkedText :text="sessionTitle(s)" /></span>
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
              :title="s.pinned ? 'Let the inbox hand this session other work again' : 'Keep this session for your own work: the inbox will not hand it other work'"
              @click="act({ action: 'pin', session: s.n, pinned: !s.pinned })"
            >
              {{ s.pinned ? 'Release for other work' : 'Keep for me' }}
            </button>
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="needs-heading"
        class="flex flex-col gap-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="needs-heading"
            class="section-title"
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
            v-for="k in KINDS"
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
        <PDSExpCallout
          v-if="waitingLine"
          appearance="subtle"
          color="info"
          icon="lucide:message-circle-question"
          :heading="waitingLine"
          data-testid="waiting-in-chat"
        >
          <template #description>
            <span class="text-sm">
              Answer there. What is still open shows up here 15 minutes after your last message in that chat.
              <template
                v-for="(w, i) in waitingInChat"
                :key="w.session"
              >
                {{ i ? '·' : '' }} Session {{ w.session }} asked <RelativeTime :at="w.since" />,
                <template v-if="w.until">shows here <RelativeTime :at="w.until" /></template>
                <template v-else>shows here once it has finished working</template>
              </template>
            </span>
          </template>
        </PDSExpCallout>
        <p
          v-if="anchorNotice"
          role="status"
          class="text-sm text-foreground-muted"
          data-testid="anchor-notice"
        >
          {{ anchorNotice }}
        </p>
        <p class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-muted">
          <span>Showing the items of your <NuxtLink
            to="/focus"
            class="underline"
          >focused cards</NuxtLink> and anything critical.</span>
          <NuxtLink
            to="/summary"
            class="underline"
          >FYIs are in the daily summary<template v-if="hiddenFyis"> ({{ hiddenFyis }} not in it yet)</template></NuxtLink>
        </p>
        <p
          v-if="!hasFocusedCards"
          class="text-sm text-foreground-muted"
        >
          You have no focused cards yet, so only critical items show here and the rest is under "Not now". Add what you work on now on the <NuxtLink
            to="/focus"
            class="underline"
          >Focus page</NuxtLink>.
        </p>
        <p
          v-if="!needsYou.length"
          class="text-sm text-foreground-muted"
        >
          {{ hiddenCount ? `Nothing to show here: ${hiddenCount} hidden by the filters above.` : 'Nothing for your focused cards right now.' }}
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
              :card-title="cardTitle(item.card_id)"
              @answer="(answer: string, backlog: boolean) => act({ action: 'answer', id: item.id, answer, backlog })"
              @close="act({ action: 'close', id: item.id })"
              @snooze="act({ action: 'snooze', id: item.id, until: tomorrow() })"
            />
          </li>
        </ul>
        <details
          v-if="notNow.length"
          :open="notNowOpen"
          data-testid="not-now"
          @toggle="(e: Event) => (notNowOpen = (e.target as HTMLDetailsElement).open)"
        >
          <summary class="cursor-pointer font-semibold">
            Not now ({{ notNow.length }}) <span class="text-sm font-normal text-foreground-muted">· items of parked cards and items on no card; nothing is closed</span>
          </summary>
          <ul class="mt-3 grid gap-3 lg:grid-cols-2">
            <li
              v-for="{ item, task } in notNow"
              :key="item.id"
            >
              <InboxItemCard
                :item="item"
                :task="task"
                :busy="busy"
                :can-backlog="canBacklog(task)"
                :card-title="cardTitle(item.card_id)"
                @answer="(answer: string, backlog: boolean) => act({ action: 'answer', id: item.id, answer, backlog })"
                @close="act({ action: 'close', id: item.id })"
                @snooze="act({ action: 'snooze', id: item.id, until: tomorrow() })"
              />
            </li>
          </ul>
        </details>
      </section>

      <section
        aria-labelledby="tasks-heading"
        class="flex flex-col gap-4"
      >
        <h2
          id="tasks-heading"
          class="section-title"
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
                      <LinkedText :text="t.title" />
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
                  <span class="text-foreground-muted">Asked:</span> <LinkedText :text="t.asked" />
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
                  v-if="t.attachments?.length"
                  class="flex flex-wrap gap-x-3 gap-y-1 text-sm"
                >
                  <span class="text-foreground-muted">Attached:</span>
                  <NuxtLink
                    v-for="a in t.attachments"
                    :key="a.id"
                    :to="`/attachments/${a.id}`"
                    class="underline"
                  >A-{{ a.id }} {{ a.title }}</NuxtLink>
                </p>
                <p
                  v-if="t.next"
                  class="text-sm"
                >
                  <span class="text-foreground-muted">Next:</span> <LinkedText :text="t.next" />
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
              T-{{ t.id }} · session {{ t.session }} · <LinkedText :text="t.title" /> · {{ STATUS[t.status]?.label }}<template v-if="t.closed_note">
                (<LinkedText :text="t.closed_note" />)
              </template>
            </li>
          </ul>
        </details>
      </section>
    </main>
  </div>
</template>
