<script setup lang="ts">
import type { CiOverview } from '#shared/types/ci'

/** The CI runs of the organisation's repositories, default branches only, from the dashboard's own history (synced hourly). */
useHead({ title: 'CI · Repo Dashboard' })

const { data, error, syncNow } = useCiData<CiOverview>('/api/ci')

const filter = ref<CiFilter>('all')
const search = ref('')
const rows = computed(() => filterCiRows(data.value?.rows ?? [], filter.value, search.value))
const summary = computed(() => summarizeCi(data.value?.rows ?? []))
const sync = computed(() => data.value?.sync)
const loading = computed(() => data.value === null && !error.value)

const menuItems = computed(() => [
  { id: 'sync', label: sync.value?.running ? 'Refreshing from GitHub…' : 'Refresh now', icon: 'lucide:refresh-cw', disabled: Boolean(sync.value?.running) },
])
function onMenu(id: string) {
  if (id === 'sync') void syncNow()
}
function setFilter(next: CiFilter) {
  filter.value = filter.value === next ? 'all' : next
}
</script>

<template>
  <div class="min-h-screen">
    <AppHeader
      title="CI"
      :items="menuItems"
      @select="onMenu"
    >
      <template #subtitle>
        <template v-if="sync?.running">
          Refreshing from GitHub… {{ sync.done }} of {{ sync.total || '?' }} repositories
        </template>
        <template v-else-if="sync?.lastSyncedAt">
          {{ data?.org }} · default branches · synced <RelativeTime :at="sync.lastSyncedAt" />, every hour
        </template>
        <template v-else-if="data">
          Not synced yet
        </template>
        <template v-else>
          Loading…
        </template>
      </template>
    </AppHeader>

    <main
      id="main-content"
      class="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-4 py-8 sm:px-8"
    >
      <p
        v-if="error"
        role="alert"
        class="text-sm text-danger-text"
      >
        {{ error }}
      </p>
      <p
        v-if="sync?.lastError"
        class="text-sm text-warning-text"
      >
        The last sync had a problem: {{ sync.lastError }}
      </p>

      <section aria-labelledby="ci-summary-heading">
        <h2
          id="ci-summary-heading"
          class="sr-only"
        >
          Summary
        </h2>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="Workflows"
            :value="summary.workflows"
            :hint="`in ${summary.repos} repositories`"
            :active="filter === 'all'"
            :loading="loading"
            @select="filter = 'all'"
          />
          <StatTile
            label="Red"
            :value="summary.red"
            :tone="summary.red > 0 ? 'danger' : 'success'"
            hint="last result failed"
            :active="filter === 'red'"
            :loading="loading"
            @select="setFilter('red')"
          />
          <StatTile
            label="Running"
            :value="summary.running"
            :tone="summary.running > 0 ? 'warning' : 'neutral'"
            hint="at the last sync"
            :active="filter === 'running'"
            :loading="loading"
            @select="setFilter('running')"
          />
          <StatTile
            label="Green"
            :value="summary.green"
            tone="success"
            hint="last result passed"
            :active="filter === 'green'"
            :loading="loading"
            @select="setFilter('green')"
          />
        </div>
      </section>

      <section
        aria-labelledby="ci-rows-heading"
        class="flex flex-col gap-4"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <h2
            id="ci-rows-heading"
            class="text-lg font-semibold"
          >
            Workflows <span class="text-sm font-normal text-foreground-muted">({{ rows.length }}<template v-if="data && rows.length !== data.rows.length"> of {{ data.rows.length }}</template>) · red first, the longest red at the top</span>
          </h2>
          <div class="w-full sm:w-64">
            <PDSInput
              v-model="search"
              type="search"
              placeholder="Search repo or workflow"
              aria-label="Search workflows"
            />
          </div>
        </div>
        <p
          v-if="data && data.rows.length === 0"
          class="text-sm text-foreground-muted"
        >
          {{ sync?.running ? 'The first sync is running; the list fills in when it is done.' : 'No CI runs stored yet. Use Refresh now in the menu.' }}
        </p>
        <p
          v-else-if="data && rows.length === 0"
          class="text-sm text-foreground-muted"
        >
          No workflow matches.
        </p>
        <ul
          v-if="rows.length"
          class="divide-y divide-border rounded-surface border border-border bg-surface"
        >
          <CiRow
            v-for="row in rows"
            :key="`${row.repo}:${row.workflowId}`"
            :row="row"
            :explained="data?.explained ?? []"
          />
        </ul>
      </section>

      <section
        v-if="data?.noAccess.length"
        aria-labelledby="ci-no-access-heading"
        class="flex flex-col gap-2"
      >
        <h2
          id="ci-no-access-heading"
          class="text-sm font-semibold"
        >
          No access ({{ data.noAccess.length }})
        </h2>
        <ul class="flex flex-col gap-1 text-sm text-foreground-muted">
          <li
            v-for="repo in data.noAccess"
            :key="repo.name"
            class="flex items-center gap-2"
          >
            <PDSIcon
              name="lucide:lock"
              size="14"
            />
            <a
              :href="repo.url"
              target="_blank"
              rel="noopener"
              class="underline"
            >{{ repo.name }}</a> · {{ repo.error }}
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>
