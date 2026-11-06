<script setup lang="ts">
import type { CiWorkflowRow } from '#shared/types/ci'

/** One repo × workflow on the default branch: state, last run, how long it has been red, the last runs and the duration. */
const props = withDefaults(defineProps<{ row: CiWorkflowRow, explained: number[], showRepo?: boolean }>(), { showRepo: true })

const trend = computed(() => durationTrend(props.row))
/** The latest failed run, which "Why did this fail?" explains. */
const failedRun = computed(() => (props.row.state === 'failure' ? props.row.recent.find(run => run.state === 'failure') ?? null : null))
const since = computed(() => props.row.failingSince)
</script>

<template>
  <li class="flex flex-col gap-3 px-4 py-4">
    <div class="grid items-start gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div class="flex min-w-0 items-start gap-2">
        <span class="mt-0.5 shrink-0">
          <PDSIcon
            v-if="row.running"
            name="lucide:loader-circle"
            size="18"
            class="animate-spin text-warning-text"
          />
          <PDSIcon
            v-else-if="row.state === 'failure'"
            name="lucide:circle-x"
            size="18"
            class="text-danger-text"
          />
          <PDSIcon
            v-else-if="row.state === 'success'"
            name="lucide:circle-check"
            size="18"
            class="text-success-text"
          />
          <PDSIcon
            v-else
            name="lucide:circle-minus"
            size="18"
            class="text-foreground-muted"
          />
          <span class="sr-only">{{ row.running ? 'Running' : checkLabel[row.state] }}</span>
        </span>
        <div class="min-w-0">
          <h3 class="wrap-anywhere text-sm font-semibold">
            <NuxtLink
              v-if="showRepo"
              :to="`/ci/${row.repo}`"
              class="underline-offset-4 hover:underline"
            >{{ row.repo }}</NuxtLink><span
              v-if="showRepo"
              class="font-normal text-foreground-muted"
            > · </span>{{ row.workflow }}
          </h3>
          <p class="mt-0.5 text-xs text-foreground-muted">
            <a
              :href="row.last.url"
              target="_blank"
              rel="noopener"
              class="underline underline-offset-2"
            >Last run</a>:
            <template v-if="row.running">
              running since <RelativeTime :at="row.last.startedAt" />
            </template>
            <template v-else>
              {{ (row.last.conclusion ?? row.last.status).replace('_', ' ') }} <RelativeTime :at="row.last.createdAt" /><template v-if="row.last.durationS !== null">
                in {{ formatDuration(row.last.durationS) }}
              </template>
            </template>
          </p>
          <p class="mt-0.5 wrap-anywhere text-xs text-foreground-muted">
            <span class="font-mono">{{ row.last.sha.slice(0, 7) }}</span> {{ row.last.title }} · {{ row.last.author }}
          </p>
        </div>
      </div>

      <div class="min-w-0 text-xs">
        <template v-if="since">
          <p class="text-sm font-semibold text-danger-text">
            Red for {{ since.beforeHistory ? 'at least ' : '' }}{{ elapsed(since.run.createdAt) }}
          </p>
          <p class="mt-0.5 wrap-anywhere text-foreground-muted">
            {{ since.beforeHistory ? 'Oldest stored failure' : 'Since' }}
            <a
              :href="since.run.url"
              target="_blank"
              rel="noopener"
              class="underline underline-offset-2"
            ><span class="font-mono">{{ since.run.sha.slice(0, 7) }}</span> {{ since.run.title }}</a>
            by {{ since.run.author }} · {{ since.count }} failing run{{ since.count === 1 ? '' : 's' }}
          </p>
        </template>
        <p
          v-else-if="row.state === 'success'"
          class="text-sm text-success-text"
        >
          Green
        </p>
        <p
          v-else
          class="text-sm text-foreground-muted"
        >
          No pass or fail yet (only cancelled or skipped runs)
        </p>
        <p
          v-if="row.avgDurationS !== null"
          class="mt-1 text-foreground-muted"
        >
          Takes {{ formatDuration(row.avgDurationS) }} on average<template v-if="trend">
            · <span :class="trend.slower ? 'text-warning-text' : ''">{{ trend.label }}</span>
          </template>
        </p>
      </div>

      <CiRunStrip
        :runs="row.recent"
        class="lg:justify-end lg:pt-1"
      />
    </div>
    <CiExplain
      v-if="failedRun"
      :key="failedRun.id"
      :run-id="failedRun.id"
      :explained="explained.includes(failedRun.id)"
    />
  </li>
</template>
