<script setup lang="ts">
import { PDSExpCallout } from '@paqtdesign/experimental/vue'
import type { Card, CardLink, CardsResponse, FocusPrsResponse, FocusReposResponse } from '#shared/types/focus'
import type { InboxOverview } from '#shared/types/inbox'

useHead({ title: 'Focus · Repo Dashboard' })

/**
 * Ricardo's focus page: his own cards (only he adds, edits, reorders or removes them), each focused or parked, with the
 * assistant's plan, the inbox items linked to it and the PRs that wait for him. The inbox shows the items of focused cards first.
 */
const { data: cardsData, refresh: refreshCards } = await useFetch<CardsResponse>('/api/cards')
const { data: reposData, refresh: refreshRepos } = await useFetch<FocusReposResponse>('/api/focus/repos')
const { data: prsData, refresh: refreshPrs, status: prsStatus } = await useFetch<FocusPrsResponse>('/api/focus/prs', { lazy: true, server: false })
const { data: inbox } = await useFetch<InboxOverview>('/api/inbox')

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => void refreshCards(), 20000)
})
onBeforeUnmount(() => clearInterval(timer))

const cards = computed(() => cardsData.value?.cards ?? [])
const focused = computed(() => cards.value.filter(c => c.status === 'focused'))
const parked = computed(() => cards.value.filter(c => c.status === 'parked'))

const busy = ref(false)
const actionError = ref<string | null>(null)
async function post(url: string, body: Record<string, unknown>) {
  busy.value = true
  actionError.value = null
  try {
    await $fetch(url, { method: 'POST', body, headers: { 'X-LSS-Action': '1' } })
    await refreshCards()
  }
  catch (e) {
    actionError.value = (e as Error).message
  }
  finally {
    busy.value = false
  }
}
const update = (card: Card, patch: Record<string, unknown>) => post('/api/cards', { action: 'update', id: card.id, ...patch })
const remove = (card: Card) => post('/api/cards', { action: 'delete', id: card.id })
const askPlan = (card: Card) => post('/api/cards/plan-request', { id: card.id })
/** Move a card up or down within its group (focused or parked); the order of the other group stays. */
function move(card: Card, by: -1 | 1) {
  const group = card.status === 'focused' ? focused.value : parked.value
  const i = group.findIndex(c => c.id === card.id)
  const j = i + by
  if (i < 0 || j < 0 || j >= group.length) return
  const reordered = [...group]
  ;[reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!]
  const other = card.status === 'focused' ? parked.value : focused.value
  const ids = (card.status === 'focused' ? [...reordered, ...other] : [...other, ...reordered]).map(c => c.id)
  void post('/api/cards', { action: 'reorder', ids })
}

// Add a card.
const newTitle = ref('')
const newNote = ref('')
const newLinks = ref('')
const newParked = ref(false)
function parseLinks(text: string): CardLink[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map((line) => {
    const [a, b] = line.split('|').map(s => s.trim())
    return b ? { label: a ?? b, url: b } : { label: a ?? '', url: a ?? '' }
  })
}
async function addCard() {
  if (!newTitle.value.trim()) return
  await post('/api/cards', { action: 'create', title: newTitle.value.trim(), note: newNote.value.trim(), links: parseLinks(newLinks.value), status: newParked.value ? 'parked' : 'focused' })
  if (!actionError.value) {
    newTitle.value = ''
    newNote.value = ''
    newLinks.value = ''
    newParked.value = false
  }
}

// The inbox items per card (those that still need him), linking to the item in the inbox.
const itemsOf = (card: Card) => (inbox.value?.tasks ?? []).flatMap(t => t.items).filter(i => i.card_id === card.id && i.needs_you && !i.held_since).map(i => ({ id: i.id, title: i.title }))

// PRs: on the card they belong to (a link to the PR or its repo), the rest in "Not on a card".
const review = computed(() => prsByCard(prsData.value?.review ?? [], cards.value))
const quick = computed(() => prsByCard(prsData.value?.quick ?? [], cards.value))
const prsOf = (card: Card) => [...(review.value.byCard.get(card.id) ?? []), ...(quick.value.byCard.get(card.id) ?? [])]

// The repo setting.
const repos = computed(() => reposData.value?.repos ?? [])
const newRepo = ref('')
const repoError = ref<string | null>(null)
async function saveRepos(list: string[]) {
  repoError.value = null
  try {
    await $fetch('/api/focus/repos', { method: 'POST', body: { repos: list }, headers: { 'X-LSS-Action': '1' } })
    await refreshRepos()
    await refreshPrs()
  }
  catch (e) {
    repoError.value = (e as Error).message
  }
}
function addRepo() {
  const value = newRepo.value.trim()
  if (!validRepoEntry(value)) {
    repoError.value = 'Use org/repo, or org/* for all repos of an organisation.'
    return
  }
  if (!repos.value.includes(value)) void saveRepos([...repos.value, value])
  newRepo.value = ''
}
const unavailable = computed(() => [cardsData.value, reposData.value].find(d => d && !d.available)?.error ?? null)
</script>

<template>
  <div class="min-h-screen">
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-black focus:p-3 focus:text-white"
      href="#main-content"
    >Skip to content</a>

    <AppHeader title="Focus">
      <template #subtitle>
        {{ focused.length }} focused · {{ parked.length }} parked · {{ (prsData?.review.length ?? 0) }} PRs wait for your review
      </template>
    </AppHeader>

    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-4 py-8 sm:px-8"
    >
      <p
        v-if="unavailable || actionError"
        role="alert"
        class="text-danger-text"
      >
        {{ actionError ?? unavailable }}
      </p>

      <section
        aria-labelledby="focused-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="focused-heading"
          class="text-lg font-semibold"
        >
          Focused
        </h2>
        <p
          v-if="!focused.length"
          class="text-sm text-foreground-muted"
        >
          No focused cards yet. Add what you work on now below; the inbox then shows its items first.
        </p>
        <ul class="grid gap-3 lg:grid-cols-2">
          <li
            v-for="(card, i) in focused"
            :key="card.id"
          >
            <FocusCard
              :card="card"
              :items="itemsOf(card)"
              :prs="prsOf(card)"
              :first="i === 0"
              :last="i === focused.length - 1"
              :busy="busy"
              @update="(patch) => update(card, patch)"
              @delete="remove(card)"
              @move="(by) => move(card, by)"
              @plan="askPlan(card)"
            />
          </li>
        </ul>

        <form
          class="flex flex-col gap-2 rounded border border-dashed border-border p-3"
          aria-label="Add a card"
          @submit.prevent="addCard"
        >
          <PDSInput
            v-model="newTitle"
            aria-label="New card title"
            placeholder="Add a card: what you want to work on"
          />
          <template v-if="newTitle.trim()">
            <PDSTextarea
              v-model="newNote"
              :rows="2"
              aria-label="New card note"
              placeholder="Note (optional)"
            />
            <PDSTextarea
              v-model="newLinks"
              :rows="2"
              aria-label="New card links"
              placeholder="Links, one per line: a PR or repo URL, org/repo, or label | url (optional)"
            />
          </template>
          <div class="flex flex-wrap items-center gap-3">
            <PDSButton
              size="sm"
              color="brand"
              type="submit"
              :disabled="busy || !newTitle.trim()"
            >
              Add card
            </PDSButton>
            <label class="flex items-center gap-2 text-sm">
              <input
                v-model="newParked"
                type="checkbox"
              > Park it (don't forget this, but not now)
            </label>
          </div>
        </form>
      </section>

      <details
        v-if="parked.length"
        class="flex flex-col gap-3"
      >
        <summary class="cursor-pointer text-lg font-semibold">
          Parked ({{ parked.length }})
        </summary>
        <ul class="mt-3 grid gap-3 lg:grid-cols-2">
          <li
            v-for="(card, i) in parked"
            :key="card.id"
          >
            <FocusCard
              :card="card"
              :items="itemsOf(card)"
              :prs="prsOf(card)"
              :first="i === 0"
              :last="i === parked.length - 1"
              :busy="busy"
              @update="(patch) => update(card, patch)"
              @delete="remove(card)"
              @move="(by) => move(card, by)"
              @plan="askPlan(card)"
            />
          </li>
        </ul>
      </details>

      <section
        aria-labelledby="prs-heading"
        class="flex flex-col gap-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="prs-heading"
            class="text-lg font-semibold"
          >
            PRs waiting for you
          </h2>
          <PDSButton
            size="sm"
            appearance="outlined"
            :disabled="prsStatus === 'pending'"
            @click="refreshPrs()"
          >
            {{ prsStatus === 'pending' ? 'Loading…' : 'Refresh' }}
          </PDSButton>
        </div>
        <PDSExpCallout
          appearance="subtle"
          color="info"
          icon="lucide:shield-check"
          heading="Every PR needs at least one human approval; nothing is merged automatically."
        />
        <p
          v-if="prsData && !prsData.available"
          role="alert"
          class="text-sm text-danger-text"
        >
          The PRs could not be loaded: {{ prsData.error }}
        </p>
        <div class="grid gap-6 lg:grid-cols-2">
          <div class="flex flex-col gap-2">
            <h3 class="font-semibold">
              Waiting for your review, not on a card ({{ review.loose.length }})
            </h3>
            <p class="text-xs text-foreground-muted">
              Your review is requested, or it is a <code>lane: careful</code> PR without your approval. PRs on a card show on that card.
            </p>
            <p
              v-if="prsData?.available && !review.loose.length"
              class="text-sm text-foreground-muted"
            >
              Nothing.
            </p>
            <FocusPrRow
              v-for="pr in review.loose"
              :key="pr.url"
              :pr="pr"
            />
          </div>
          <div class="flex flex-col gap-2">
            <h3 class="font-semibold">
              Ready for a quick approval ({{ quick.loose.length }})
            </h3>
            <p class="text-xs text-foreground-muted">
              <code>lane: fast</code> PRs whose AI review passed and that no person approved yet: anyone may approve them, you or a colleague.
            </p>
            <p
              v-if="prsData?.available && !quick.loose.length"
              class="text-sm text-foreground-muted"
            >
              Nothing.
            </p>
            <FocusPrRow
              v-for="pr in quick.loose"
              :key="pr.url"
              :pr="pr"
            />
          </div>
        </div>
        <p
          v-if="prsData?.fetchedAt"
          class="text-xs text-foreground-muted"
        >
          From GitHub <RelativeTime :at="prsData.fetchedAt" />, as {{ prsData.viewer ?? 'unknown' }}.
        </p>
      </section>

      <section
        aria-labelledby="repos-heading"
        class="flex flex-col gap-2"
      >
        <h2
          id="repos-heading"
          class="text-lg font-semibold"
        >
          Repos whose PRs show here
        </h2>
        <ul class="flex flex-wrap gap-2">
          <li
            v-for="r in repos"
            :key="r"
            class="flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-xs"
          >
            {{ r }}
            <button
              type="button"
              class="ml-1 underline"
              :aria-label="`Remove ${r}`"
              @click="saveRepos(repos.filter(x => x !== r))"
            >
              remove
            </button>
          </li>
        </ul>
        <form
          class="flex flex-wrap items-center gap-2"
          @submit.prevent="addRepo"
        >
          <div class="w-64">
            <PDSInput
              v-model="newRepo"
              aria-label="Add a repo"
              placeholder="org/repo or org/*"
            />
          </div>
          <PDSButton
            size="sm"
            appearance="outlined"
            type="submit"
          >
            Add
          </PDSButton>
        </form>
        <p
          v-if="repoError"
          role="alert"
          class="text-sm text-danger-text"
        >
          {{ repoError }}
        </p>
      </section>
    </main>
  </div>
</template>
