<script setup lang="ts">
import type { RepoStatus } from '#shared/types/repo'

const props = defineProps<{ repo: RepoStatus, githubLoading: boolean }>()
defineEmits<{ select: [] }>()

const MAX_FINDINGS = 3

const git = computed(() => props.repo.git)
const tree = computed(() => git.value?.workingTree)
const pulls = computed(() => props.repo.github?.pullRequests ?? [])
const findings = computed(() => props.repo.attention.slice(0, MAX_FINDINGS))
const hiddenFindings = computed(() => Math.max(0, props.repo.attention.length - MAX_FINDINGS))
const ci = computed(() => {
  const runs = props.repo.github?.defaultBranchRuns ?? []
  if (runs.some(run => run.state === 'failure')) return 'failure'
  if (runs.some(run => run.state === 'pending')) return 'pending'
  return runs.length > 0 ? 'success' : 'none'
})
const rawChanges = computed(() => (tree.value ? tree.value.staged + tree.value.unstaged : 0))
</script>

<template>
  <button
    type="button"
    class="flex h-full w-full flex-col gap-3 rounded-surface border bg-surface p-4 text-left transition-colors hover:border-border-strong"
    :class="repo.severity === 'critical' ? 'border-danger/50' : 'border-border'"
    :aria-label="`Open details for ${repo.name}`"
    @click="$emit('select')"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <SeverityIcon :severity="repo.severity" />
        <h3 class="truncate text-base font-semibold">
          {{ repo.name }}
        </h3>
      </div>
      <PDSBadge
        v-if="repo.github?.archived"
        size="sm"
      >
        Archived
      </PDSBadge>
    </div>

    <div
      v-if="git"
      class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-muted"
    >
      <span class="inline-flex min-w-0 items-center gap-1">
        <PDSIcon
          name="lucide:git-branch"
          size="14"
        />
        <span class="truncate font-mono text-xs text-foreground">{{ git.branch ?? 'detached HEAD' }}</span>
      </span>
      <span
        v-if="git.upstream"
        class="inline-flex items-center gap-2 tabular-nums"
      >
        <span
          :class="git.ahead > 0 ? 'font-semibold text-foreground' : ''"
          title="Commits to push"
        >↑{{ git.ahead }}</span>
        <span
          :class="git.behind > 0 ? 'font-semibold text-foreground' : ''"
          title="Commits to pull"
        >↓{{ git.behind }}</span>
      </span>
      <span
        v-else
        class="text-xs"
      >no upstream</span>
    </div>
    <p
      v-else
      class="text-sm text-danger"
    >
      {{ repo.gitError }}
    </p>

    <div class="flex flex-wrap gap-1.5">
      <PDSBadge
        v-if="rawChanges > 0"
        color="warning"
        appearance="subtle"
        size="sm"
      >
        {{ rawChanges }} changed
      </PDSBadge>
      <PDSBadge
        v-if="tree && tree.untracked > 0"
        appearance="subtle"
        size="sm"
      >
        {{ tree.untracked }} untracked
      </PDSBadge>
      <PDSBadge
        v-if="tree && tree.conflicted > 0"
        color="danger"
        appearance="solid"
        size="sm"
      >
        {{ tree.conflicted }} conflicts
      </PDSBadge>
      <PDSBadge
        v-if="git && git.stashCount > 0"
        appearance="subtle"
        size="sm"
      >
        {{ git.stashCount }} stash
      </PDSBadge>
      <PDSBadge
        v-if="pulls.length > 0"
        color="info"
        appearance="subtle"
        size="sm"
      >
        {{ pulls.length }} PR{{ pulls.length === 1 ? '' : 's' }}
      </PDSBadge>
      <PDSBadge
        v-if="ci !== 'none'"
        :color="checkColor[ci]"
        appearance="subtle"
        size="sm"
      >
        CI {{ checkLabel[ci].toLowerCase() }}
      </PDSBadge>
      <PDSBadge
        v-if="githubLoading && !repo.github"
        appearance="subtle"
        size="sm"
      >
        GitHub loading…
      </PDSBadge>
      <PDSBadge
        v-else-if="repo.githubError && !repo.github"
        appearance="subtle"
        size="sm"
        :title="repo.githubError"
      >
        No GitHub data
      </PDSBadge>
    </div>

    <ul
      v-if="findings.length > 0"
      class="flex flex-col gap-1 text-sm"
    >
      <li
        v-for="item in findings"
        :key="item.code"
        class="flex items-start gap-2"
      >
        <SeverityIcon
          :severity="item.severity"
          class="mt-0.5 shrink-0"
        />
        <span>{{ item.message }}</span>
      </li>
      <li
        v-if="hiddenFindings > 0"
        class="pl-6 text-xs text-foreground-muted"
      >
        +{{ hiddenFindings }} more
      </li>
    </ul>
    <p
      v-else
      class="text-sm text-foreground-muted"
    >
      Nothing needs your attention.
    </p>

    <p
      v-if="git?.lastCommit"
      class="mt-auto truncate border-t border-border pt-3 text-xs text-foreground-muted"
    >
      {{ git.lastCommit.subject }} · {{ relativeTime(git.lastCommit.date) }}
    </p>
  </button>
</template>
