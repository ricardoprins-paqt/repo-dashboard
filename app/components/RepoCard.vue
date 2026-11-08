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
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
/** Counts that are context, not a call to act: plain muted text next to the branch instead of badges. */
const quietFacts = computed(() => {
  const facts: { text: string, title?: string }[] = []
  if (pulls.value.length > 0) facts.push({ text: plural(pulls.value.length, 'open PR') })
  if (git.value && git.value.worktrees.length > 0) {
    facts.push({ text: plural(git.value.worktrees.length, 'worktree'), title: git.value.worktrees.map(w => `${w.label}: ${w.branch ?? 'detached HEAD'}`).join('\n') })
  }
  if (tree.value && tree.value.untracked > 0) facts.push({ text: `${tree.value.untracked} untracked` })
  if (git.value && git.value.stashCount > 0) facts.push({ text: `${git.value.stashCount} stash${git.value.stashCount === 1 ? '' : 'es'}` })
  return facts
})
/** Badges only for what asks for action: local changes, conflicts, CI state, missing GitHub data. */
const loudBadges = computed(() => rawChanges.value > 0 || (tree.value?.conflicted ?? 0) > 0 || ci.value !== 'none'
  || (props.githubLoading && !props.repo.github) || Boolean(props.repo.githubError && !props.repo.github))
</script>

<template>
  <!-- The repo name is a native button stretched over the whole card (see `after:` classes), so the card is one click target and one tab stop. -->
  <!-- One surface, no header band: name and state on top, then what needs attention, the last commit at the bottom. -->
  <PDSCard
    class="card-interactive relative h-full"
    appearance="outlined"
    :color="repo.severity === 'critical' ? 'danger' : undefined"
  >
    <div class="flex h-full flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <SeverityIcon :severity="repo.severity" />
            <h3 class="min-w-0 truncate text-base font-semibold">
              <button
                type="button"
                class="max-w-full truncate text-left outline-none after:absolute after:inset-0 after:content-['']"
                :aria-label="`Open details for ${repo.name}`"
                @click="$emit('select')"
              >
                {{ repo.name }}
              </button>
            </h3>
          </div>
          <PDSBadge
            v-if="repo.github?.archived"
            size="sm"
          >
            Archived
          </PDSBadge>
        </div>
        <p
          v-if="git"
          class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-foreground-muted"
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
            class="inline-flex items-center gap-1.5 tabular-nums"
          >
            <span
              :class="git.ahead > 0 ? 'font-semibold text-foreground' : ''"
              :title="`${git.ahead} commit${git.ahead === 1 ? '' : 's'} to push`"
            >↑{{ git.ahead }}</span>
            <span
              :class="git.behind > 0 ? 'font-semibold text-foreground' : ''"
              :title="`${git.behind} commit${git.behind === 1 ? '' : 's'} to pull`"
            >↓{{ git.behind }}</span>
          </span>
          <span v-else>no upstream</span>
          <template
            v-for="fact in quietFacts"
            :key="fact.text"
          >
            <span aria-hidden="true">·</span>
            <span :title="fact.title">{{ fact.text }}</span>
          </template>
        </p>
        <p
          v-else
          class="text-sm text-danger-text"
        >
          {{ repo.gitError }}
        </p>
      </div>

      <div
        v-if="loudBadges"
        class="flex flex-wrap gap-1.5"
      >
        <PDSBadge
          v-if="rawChanges > 0"
          color="warning"
          appearance="subtle"
          size="sm"
        >
          {{ rawChanges }} changed
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
        class="flex flex-col gap-1.5 text-sm"
      >
        <li
          v-for="item in findings"
          :key="`${item.worktree ?? ''}:${item.code}`"
          class="flex items-start gap-2"
        >
          <SeverityIcon
            :severity="item.severity"
            class="mt-0.5 shrink-0"
          />
          <span><span
            v-if="item.worktree"
            class="font-semibold"
          >{{ item.worktree }}: </span>{{ item.message }}</span>
        </li>
        <li
          v-if="hiddenFindings > 0"
          class="pl-6 text-xs text-foreground-muted"
        >
          and {{ hiddenFindings }} more
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
        class="mt-auto truncate pt-1 text-xs text-foreground-muted"
        :title="git.lastCommit.subject"
      >
        Last commit {{ relativeTime(git.lastCommit.date) }}: {{ git.lastCommit.subject }}
      </p>
    </div>
  </PDSCard>
</template>
