<script setup lang="ts">
import type { CiRepoDetail } from '#shared/types/ci'

/** One repository's CI: its workflows and the recent runs on the default branch, each failed one with "Why did this fail?". */
const route = useRoute()
const name = computed(() => String(route.params.repo ?? ''))
useHead({ title: () => `${name.value} · CI · Repo Dashboard` })

const { data, error } = useCiData<CiRepoDetail>(() => `/api/ci/repos/${encodeURIComponent(name.value)}`)
</script>

<template>
  <div class="min-h-screen">
    <AppHeader :title="`CI · ${name}`">
      <template #subtitle>
        <template v-if="data">
          <a
            :href="data.repo.url"
            target="_blank"
            rel="noopener"
            class="hover:underline"
          >{{ data.repo.url.replace('https://', '') }}</a> · {{ data.repo.defaultBranch }} · checked <RelativeTime :at="data.repo.checkedAt" />
        </template>
      </template>
    </AppHeader>
    <main class="mx-auto flex w-full max-w-[84rem] flex-col gap-8 px-4 py-8 sm:px-8">
      <p class="text-sm">
        <NuxtLink
          to="/ci"
          class="underline"
        >All workflows</NuxtLink>
      </p>
      <p
        v-if="error"
        role="alert"
        class="text-sm text-danger-text"
      >
        {{ error }}
      </p>
      <p
        v-if="data?.repo.access === 'none'"
        class="text-sm text-warning-text"
      >
        No access: {{ data.repo.error }}
      </p>

      <section
        v-if="data?.rows.length"
        aria-labelledby="ci-workflows-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="ci-workflows-heading"
          class="text-lg font-semibold"
        >
          Workflows
        </h2>
        <ul class="divide-y divide-border rounded-surface border border-border bg-surface">
          <CiRow
            v-for="row in data.rows"
            :key="row.workflowId"
            :row="row"
            :explained="data.explained"
            :show-repo="false"
          />
        </ul>
      </section>

      <section
        v-if="data"
        aria-labelledby="ci-runs-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="ci-runs-heading"
          class="text-lg font-semibold"
        >
          Recent runs on {{ data.repo.defaultBranch }} <span class="text-sm font-normal text-foreground-muted">({{ data.runs.length }})</span>
        </h2>
        <p
          v-if="!data.runs.length"
          class="text-sm text-foreground-muted"
        >
          No runs stored.
        </p>
        <ul
          v-else
          class="divide-y divide-border rounded-surface border border-border bg-surface"
        >
          <li
            v-for="run in data.runs"
            :key="run.id"
            class="flex flex-col gap-2 px-4 py-3 text-sm"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                class="inline-block size-2.5 shrink-0 self-center rounded-full"
                :class="runStateClass[run.state]"
                aria-hidden="true"
              />
              <a
                :href="run.url"
                target="_blank"
                rel="noopener"
                class="font-semibold underline-offset-4 hover:underline"
              >{{ run.workflow }}</a>
              <span :class="run.state === 'failure' ? 'text-danger-text' : 'text-foreground-muted'">{{ (run.state === 'pending' ? run.status : run.conclusion ?? run.status).replace('_', ' ') }}</span>
              <span class="text-xs text-foreground-muted">at {{ formatRunTime(run.createdAt) }} (<RelativeTime :at="run.createdAt" />) · {{ formatDuration(run.durationS) }} · {{ run.event }}</span>
            </div>
            <p class="wrap-anywhere pl-5 text-xs text-foreground-muted">
              <span class="font-mono">{{ run.sha.slice(0, 7) }}</span> {{ run.title }} · {{ run.author }}
            </p>
            <CiExplain
              v-if="run.state === 'failure'"
              class="pl-5"
              :run-id="run.id"
              :explained="data.explained.includes(run.id)"
            />
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>
