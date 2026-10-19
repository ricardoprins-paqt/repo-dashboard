<script setup lang="ts">
import { PDSExpCallout } from '@paqtdesign/experimental/vue'
import type { RepoStatus } from '#shared/types/repo'

const { theme, toggle: toggleTheme } = useTheme()
const { overview, loading, githubLoading, fetching, error, autoRefresh, load, fetchRemotes } = useRepoOverview()

const filter = ref<RepoFilter>('all')
const search = ref('')
const sort = ref<RepoSort>('attention')
const selectedName = ref<string | null>(null)
const sortValue = computed<string>({
  get: () => sort.value,
  set: (value) => {
    sort.value = SORTS.find(option => option.value === value)?.value ?? 'attention'
  },
})

const summary = computed(() => summarize(overview.value))
const repos = computed(() => sortRepos(filterRepos(overview.value?.repos ?? [], filter.value, search.value), sort.value))
const selected = computed<RepoStatus | null>(() => overview.value?.repos.find(repo => repo.name === selectedName.value) ?? null)
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (open: boolean) => {
    if (!open) selectedName.value = null
  },
})

// What needs a decision, across all repos, most severe first.
const actionItems = computed(() => {
  const rank = { critical: 0, warning: 1, info: 2 } as const
  return (overview.value?.repos ?? [])
    .flatMap(repo => repo.attention.filter(item => item.severity !== 'info').map(item => ({ repo, item })))
    .sort((a, b) => rank[a.item.severity] - rank[b.item.severity] || a.repo.name.localeCompare(b.repo.name))
})
const ACTION_PREVIEW = 8
const showAllActions = ref(false)
const visibleActions = computed(() => (showAllActions.value ? actionItems.value : actionItems.value.slice(0, ACTION_PREVIEW)))

const busy = computed(() => loading.value || fetching.value)
const initialLoad = computed(() => overview.value === null && !error.value)
// Without data and with an error there is nothing to show but the error itself.
const hasContent = computed(() => overview.value !== null || !error.value)
const updatedLabel = computed(() => {
  if (overview.value) return `Updated ${relativeTime(overview.value.generatedAt)}`
  return error.value ? 'Not loaded' : 'Loading…'
})

function setFilter(next: RepoFilter) {
  filter.value = filter.value === next ? 'all' : next
}
</script>

<template>
  <div class="min-h-screen">
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-black focus:p-3 focus:text-white"
      href="#main-content"
    >Skip to content</a>

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
            Repo dashboard
          </h1>
          <p
            class="text-xs text-foreground-muted"
            aria-live="polite"
          >
            {{ updatedLabel }}<template v-if="overview">
              · {{ overview.repos.length }} repositories<template v-if="overview.viewer">
                · {{ overview.viewer }}
              </template>
            </template>
          </p>
        </div>
        <div class="ml-auto flex flex-wrap items-center gap-3">
          <!-- PDSToggle renders a stray `size` attribute on the server, which breaks hydration. -->
          <ClientOnly>
            <PDSToggle
              v-model="autoRefresh"
              aria-label="Refresh automatically every minute"
            >
              Auto-refresh
            </PDSToggle>
          </ClientOnly>
          <!-- PDSButton does not pass aria-* attributes on to its inner <button>, so the name is slot text. -->
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
          <PDSButton
            appearance="outlined"
            :loading="loading || undefined"
            :disabled="busy"
            @click="load({ refresh: true })"
          >
            <template #start>
              <PDSIcon
                name="lucide:refresh-cw"
                size="16"
              />
            </template>
            Refresh
          </PDSButton>
          <PDSButton
            color="brand"
            :loading="fetching || undefined"
            :disabled="busy"
            @click="fetchRemotes"
          >
            <template #start>
              <PDSIcon
                name="lucide:cloud-download"
                size="16"
              />
            </template>
            Fetch from remotes
          </PDSButton>
        </div>
      </div>
    </header>

    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-4 py-8 sm:px-8"
    >
      <!-- Persistent state (the data may be stale), so a callout rather than a toast. -->
      <PDSExpCallout
        v-if="error"
        color="danger"
        appearance="subtle"
        icon="lucide:circle-x"
        callout-role="alert"
        heading="Could not load the overview"
        :description="error"
        close
        @pds-exp-callout-close="error = null"
      >
        <template #actions>
          <PDSButton

            size="sm"
            appearance="outlined"
            :disabled="busy"
            @click="load({ refresh: true })"
          >
            Try again
          </PDSButton>
        </template>
      </PDSExpCallout>

      <section
        v-if="hasContent"
        aria-labelledby="summary-heading"
      >
        <h2
          id="summary-heading"
          class="sr-only"
        >
          Summary
        </h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <StatTile
            label="Repositories"
            :value="summary.repos"
            :active="filter === 'all'"
            :loading="initialLoad"
            @select="filter = 'all'"
          />
          <StatTile
            label="Needs attention"
            :value="summary.critical + summary.warning"
            :tone="summary.critical > 0 ? 'danger' : summary.warning > 0 ? 'warning' : 'success'"
            :hint="`${summary.critical} critical`"
            :active="filter === 'attention'"
            :loading="initialLoad"
            @select="setFilter('attention')"
          />
          <StatTile
            label="Uncommitted"
            :value="summary.uncommitted"
            :tone="summary.uncommitted > 0 ? 'warning' : 'neutral'"
            hint="repos with local changes"
            :active="filter === 'uncommitted'"
            :loading="initialLoad"
            @select="setFilter('uncommitted')"
          />
          <StatTile
            label="Unpushed"
            :value="summary.unpushed"
            :tone="summary.unpushed > 0 ? 'warning' : 'neutral'"
            hint="work not on a remote"
            :active="filter === 'unpushed'"
            :loading="initialLoad"
            @select="setFilter('unpushed')"
          />
          <StatTile
            label="Behind remote"
            :value="summary.behind"
            hint="pull needed"
            :active="filter === 'behind'"
            :loading="initialLoad"
            @select="setFilter('behind')"
          />
          <StatTile
            label="CI failing"
            :value="summary.ciFailing"
            :tone="summary.ciFailing > 0 ? 'danger' : 'success'"
            hint="default branch or PRs"
            :active="filter === 'ci-failing'"
            :loading="initialLoad || (githubLoading && !summary.githubLoaded)"
            @select="setFilter('ci-failing')"
          />
          <StatTile
            label="Open PRs"
            :value="summary.openPrs"
            :hint="`${summary.myPrs} yours · ${summary.readyToMerge} ready to merge`"
            :active="filter === 'prs'"
            :loading="initialLoad || (githubLoading && !summary.githubLoaded)"
            @select="setFilter('prs')"
          />
          <StatTile
            label="Review requests"
            :value="summary.reviewRequests"
            :tone="summary.reviewRequests > 0 ? 'warning' : 'neutral'"
            hint="waiting on you"
            :active="false"
            :loading="initialLoad || (githubLoading && !summary.githubLoaded)"
            @select="setFilter('prs')"
          />
        </div>
      </section>

      <section
        v-if="actionItems.length > 0"
        aria-labelledby="actions-heading"
        class="rounded-surface border border-border bg-surface"
      >
        <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2
            id="actions-heading"
            class="text-sm font-semibold"
          >
            What needs a decision <span class="font-normal text-foreground-muted">({{ actionItems.length }})</span>
          </h2>
          <PDSButton
            v-if="actionItems.length > ACTION_PREVIEW"
            size="sm"
            appearance="outlined"
            @click="showAllActions = !showAllActions"
          >
            {{ showAllActions ? 'Show fewer' : `Show all ${actionItems.length}` }}
          </PDSButton>
        </div>
        <ul class="divide-y divide-border">
          <li
            v-for="{ repo, item } in visibleActions"
            :key="`${repo.name}:${item.worktree ?? ''}:${item.code}`"
          >
            <button
              type="button"
              class="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm hover:bg-neutral-muted"
              @click="selectedName = repo.name"
            >
              <SeverityIcon
                :severity="item.severity"
                class="mt-0.5 shrink-0"
              />
              <span class="w-52 shrink-0 truncate font-semibold">{{ repo.name }}</span>
              <span class="min-w-0 flex-1"><span
                v-if="item.worktree"
                class="font-semibold"
              >{{ item.worktree }}: </span>{{ item.message }}</span>
            </button>
          </li>
        </ul>
      </section>

      <section
        v-if="hasContent"
        aria-labelledby="repos-heading"
        class="flex flex-col gap-4"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <h2
            id="repos-heading"
            class="text-lg font-semibold"
          >
            Repositories <span class="text-sm font-normal text-foreground-muted">({{ repos.length }}<template v-if="overview && repos.length !== overview.repos.length"> of {{ overview.repos.length }}</template>)</span>
          </h2>
          <div class="flex flex-wrap items-center gap-3">
            <div class="w-64">
              <PDSInput
                v-model="search"
                type="search"
                placeholder="Search repo, branch or PR title"
                aria-label="Search repositories"
              />
            </div>
            <div class="w-52">
              <PDSSelect
                v-model="sortValue"
                :items="SORTS"
                aria-label="Sort repositories"
              />
            </div>
          </div>
        </div>

        <div
          class="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter repositories"
        >
          <PDSButton
            v-for="option in FILTERS"
            :key="option.id"
            size="sm"
            :appearance="filter === option.id ? undefined : 'outlined'"
            :color="filter === option.id ? 'brand' : undefined"
            @click="filter = option.id"
          >
            {{ option.label }}<span
              v-if="filter === option.id"
              class="sr-only"
            > (selected)</span>
          </PDSButton>
        </div>

        <div
          v-if="initialLoad"
          class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading repositories"
        >
          <div
            v-for="n in 6"
            :key="n"
            class="h-44 animate-pulse rounded-surface border border-border bg-surface"
          />
        </div>
        <p
          v-else-if="repos.length === 0"
          class="rounded-surface border border-dashed border-border p-8 text-center text-sm text-foreground-muted"
        >
          No repositories match the current filter.
        </p>
        <ul
          v-else
          class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <li
            v-for="repo in repos"
            :key="repo.path"
          >
            <RepoCard
              :repo="repo"
              :github-loading="githubLoading"
              @select="selectedName = repo.name"
            />
          </li>
        </ul>
      </section>
    </main>

    <footer class="mx-auto flex w-full max-w-[84rem] flex-wrap justify-between gap-2 px-4 py-8 text-xs text-foreground-muted sm:px-8">
      <span>Watching {{ overview?.roots.join(', ') ?? '…' }}</span>
      <span>Read-only, except “Fetch from remotes”.</span>
    </footer>

    <PDSSlideover v-model:open="detailOpen">
      <template #header>
        <span>{{ selected?.name }}</span>
      </template>
      <RepoDetail
        v-if="selected"
        :repo="selected"
      />
    </PDSSlideover>
  </div>
</template>
