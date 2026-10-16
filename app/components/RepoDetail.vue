<script setup lang="ts">
import type { ChangedFile, RepoStatus } from '#shared/types/repo'

const props = defineProps<{ repo: RepoStatus }>()

const git = computed(() => props.repo.git)
const github = computed(() => props.repo.github)

const fileKindLabel: Record<ChangedFile['kind'], string> = {
  staged: 'Staged',
  unstaged: 'Modified',
  untracked: 'Untracked',
  conflicted: 'Conflict',
}
const fileKindColor: Record<ChangedFile['kind'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  staged: 'success',
  unstaged: 'warning',
  untracked: 'neutral',
  conflicted: 'danger',
}

const reviewLabel: Record<string, string> = {
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
  REVIEW_REQUIRED: 'Review required',
}

const sortedBranches = computed(() => [...(git.value?.branches ?? [])].sort((a, b) => b.lastCommitDate.localeCompare(a.lastCommitDate)))
const runs = computed(() => [
  ...(github.value?.defaultBranchRuns ?? []).map(run => ({ ...run, scope: 'default branch' })),
  ...(github.value?.currentBranchRuns ?? []).map(run => ({ ...run, scope: 'current branch' })),
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="font-mono text-xs text-foreground-muted break-all">
      {{ repo.path }}
    </p>

    <PDSTabGroup default-active="summary">
      <PDSTab panel="summary">
        Summary
      </PDSTab>
      <PDSTab panel="changes">
        Changes
      </PDSTab>
      <PDSTab panel="branches">
        Branches
      </PDSTab>
      <PDSTab panel="prs">
        PRs{{ github ? ` (${github.pullRequests.length})` : '' }}
      </PDSTab>
      <PDSTab panel="ci">
        CI
      </PDSTab>

      <PDSTabPanel name="summary">
        <div class="flex flex-col gap-5 py-4">
          <section aria-labelledby="attention-heading">
            <h3
              id="attention-heading"
              class="mb-2 text-sm font-semibold"
            >
              Needs attention
            </h3>
            <ul
              v-if="repo.attention.length > 0"
              class="flex flex-col gap-2"
            >
              <li
                v-for="item in repo.attention"
                :key="item.code"
                class="flex items-start gap-2 text-sm"
              >
                <SeverityIcon
                  :severity="item.severity"
                  class="mt-0.5 shrink-0"
                />
                <span>{{ item.message }}</span>
              </li>
            </ul>
            <p
              v-else
              class="text-sm text-foreground-muted"
            >
              All clear.
            </p>
          </section>

          <dl
            v-if="git"
            class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm"
          >
            <dt class="text-foreground-muted">
              Branch
            </dt>
            <dd class="font-mono text-xs">
              {{ git.branch ?? 'detached HEAD' }} <span
                v-if="git.upstream"
                class="text-foreground-muted"
              >→ {{ git.upstream }}</span>
            </dd>
            <dt class="text-foreground-muted">
              Default branch
            </dt>
            <dd class="font-mono text-xs">
              {{ git.defaultBranch ?? 'unknown' }}<span
                v-if="git.vsDefault"
                class="text-foreground-muted"
              > (this branch: {{ git.vsDefault.ahead }} ahead, {{ git.vsDefault.behind }} behind)</span>
            </dd>
            <dt class="text-foreground-muted">
              Last commit
            </dt>
            <dd>
              <template v-if="git.lastCommit">
                {{ git.lastCommit.subject }}
                <span class="block text-xs text-foreground-muted">{{ git.lastCommit.author }}, {{ relativeTime(git.lastCommit.date) }}</span>
              </template>
              <template v-else>
                No commits
              </template>
            </dd>
            <dt class="text-foreground-muted">
              Last fetched
            </dt>
            <dd>{{ relativeTime(git.lastFetchedAt) }}</dd>
            <dt class="text-foreground-muted">
              Remote
            </dt>
            <dd class="break-all font-mono text-xs">
              {{ git.remoteUrl ?? 'none' }}
            </dd>
            <template v-if="github">
              <dt class="text-foreground-muted">
                GitHub
              </dt>
              <dd>
                <a
                  class="underline underline-offset-2"
                  :href="github.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ github.slug }}</a>
                <span class="text-foreground-muted"> · {{ github.private ? 'private' : 'public' }} · {{ github.openIssues }} open issue{{ github.openIssues === 1 ? '' : 's' }}</span>
              </dd>
            </template>
          </dl>
          <p
            v-if="repo.githubError && !github"
            class="text-sm text-foreground-muted"
          >
            GitHub data unavailable: {{ repo.githubError }}
          </p>
        </div>
      </PDSTabPanel>

      <PDSTabPanel name="changes">
        <div
          v-if="git"
          class="flex flex-col gap-5 py-4"
        >
          <section>
            <h3 class="mb-2 text-sm font-semibold">
              Working tree
            </h3>
            <p
              v-if="git.workingTree.files.length === 0"
              class="text-sm text-foreground-muted"
            >
              No local changes.
            </p>
            <ul
              v-else
              class="flex flex-col gap-1"
            >
              <li
                v-for="file in git.workingTree.files"
                :key="`${file.kind}:${file.path}`"
                class="flex items-center gap-2 text-sm"
              >
                <PDSBadge
                  :color="fileKindColor[file.kind]"
                  appearance="subtle"
                  size="sm"
                  class="shrink-0"
                >
                  {{ fileKindLabel[file.kind] }}
                </PDSBadge>
                <span class="min-w-0 break-all font-mono text-xs">{{ file.path }}</span>
              </li>
              <li
                v-if="git.workingTree.filesTruncated"
                class="text-xs text-foreground-muted"
              >
                More files not shown.
              </li>
            </ul>
          </section>
          <section v-if="git.unpushed.length > 0">
            <h3 class="mb-2 text-sm font-semibold">
              Not pushed ({{ git.ahead }})
            </h3>
            <ul class="flex flex-col gap-1 text-sm">
              <li
                v-for="commit in git.unpushed"
                :key="commit.hash"
              >
                <span class="font-mono text-xs text-foreground-muted">{{ commit.hash }}</span> {{ commit.subject }}
              </li>
            </ul>
          </section>
          <section v-if="git.incoming.length > 0">
            <h3 class="mb-2 text-sm font-semibold">
              Waiting on the remote ({{ git.behind }})
            </h3>
            <ul class="flex flex-col gap-1 text-sm">
              <li
                v-for="commit in git.incoming"
                :key="commit.hash"
              >
                <span class="font-mono text-xs text-foreground-muted">{{ commit.hash }}</span> {{ commit.subject }}
                <span class="text-xs text-foreground-muted"> · {{ commit.author }}</span>
              </li>
            </ul>
          </section>
          <p
            v-if="git.stashCount > 0"
            class="text-sm"
          >
            {{ git.stashCount }} stash{{ git.stashCount === 1 ? '' : 'es' }} saved. Run <code class="font-mono text-xs">git stash list</code> to inspect.
          </p>
        </div>
      </PDSTabPanel>

      <PDSTabPanel name="branches">
        <div
          v-if="git"
          class="py-4"
        >
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              Local branches
            </caption>
            <thead class="text-xs text-foreground-muted">
              <tr>
                <th
                  scope="col"
                  class="pb-2 font-semibold"
                >
                  Branch
                </th><th
                  scope="col"
                  class="pb-2 font-semibold"
                >
                  Sync
                </th><th
                  scope="col"
                  class="pb-2 font-semibold"
                >
                  Last commit
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="branch in sortedBranches"
                :key="branch.name"
                class="border-t border-border align-top"
              >
                <td class="py-2 pr-3">
                  <span class="break-all font-mono text-xs">{{ branch.name }}</span>
                  <PDSBadge
                    v-if="branch.current"
                    size="sm"
                    class="ml-1"
                  >
                    current
                  </PDSBadge>
                  <PDSBadge
                    v-if="branch.merged"
                    color="success"
                    appearance="subtle"
                    size="sm"
                    class="ml-1"
                  >
                    merged
                  </PDSBadge>
                </td>
                <td class="py-2 pr-3 tabular-nums">
                  <template v-if="branch.upstreamGone">
                    upstream gone
                  </template>
                  <template v-else-if="!branch.upstream">
                    not pushed
                  </template>
                  <template v-else>
                    ↑{{ branch.ahead }} ↓{{ branch.behind }}
                  </template>
                </td>
                <td class="py-2 text-foreground-muted">
                  {{ relativeTime(branch.lastCommitDate) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </PDSTabPanel>

      <PDSTabPanel name="prs">
        <div class="py-4">
          <p
            v-if="!github"
            class="text-sm text-foreground-muted"
          >
            GitHub data not available.
          </p>
          <p
            v-else-if="github.pullRequests.length === 0"
            class="text-sm text-foreground-muted"
          >
            No open pull requests.
          </p>
          <ul
            v-else
            class="flex flex-col gap-4"
          >
            <li
              v-for="pull in github.pullRequests"
              :key="pull.number"
              class="flex flex-col gap-1.5 border-b border-border pb-4 last:border-b-0"
            >
              <a
                class="text-sm font-semibold underline-offset-2 hover:underline"
                :href="pull.url"
                target="_blank"
                rel="noopener noreferrer"
              >#{{ pull.number }} {{ pull.title }}</a>
              <p class="text-xs text-foreground-muted">
                <span class="font-mono">{{ pull.headRef }}</span> → <span class="font-mono">{{ pull.baseRef }}</span> · {{ pull.author }}{{ pull.mine ? ' (you)' : '' }} · updated {{ relativeTime(pull.updatedAt) }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                <PDSBadge
                  v-if="pull.draft"
                  size="sm"
                  appearance="subtle"
                >
                  Draft
                </PDSBadge>
                <PDSBadge
                  v-if="pull.reviewRequestedFromMe"
                  size="sm"
                  color="warning"
                  appearance="subtle"
                >
                  Review requested from you
                </PDSBadge>
                <PDSBadge
                  v-if="pull.reviewDecision"
                  size="sm"
                  appearance="subtle"
                  :color="pull.reviewDecision === 'APPROVED' ? 'success' : pull.reviewDecision === 'CHANGES_REQUESTED' ? 'danger' : 'neutral'"
                >
                  {{ reviewLabel[pull.reviewDecision] }}
                </PDSBadge>
                <PDSBadge
                  size="sm"
                  appearance="subtle"
                  :color="checkColor[pull.checks]"
                >
                  Checks: {{ checkLabel[pull.checks].toLowerCase() }}
                </PDSBadge>
                <PDSBadge
                  v-if="pull.mergeable === 'CONFLICTING'"
                  size="sm"
                  color="danger"
                  appearance="subtle"
                >
                  Merge conflicts
                </PDSBadge>
              </div>
            </li>
          </ul>
        </div>
      </PDSTabPanel>

      <PDSTabPanel name="ci">
        <div class="py-4">
          <p
            v-if="!github"
            class="text-sm text-foreground-muted"
          >
            GitHub data not available.
          </p>
          <p
            v-else-if="runs.length === 0"
            class="text-sm text-foreground-muted"
          >
            No workflow runs found.
          </p>
          <ul
            v-else
            class="flex flex-col gap-3"
          >
            <li
              v-for="run in runs"
              :key="`${run.scope}:${run.workflow}`"
              class="flex flex-wrap items-center gap-2 text-sm"
            >
              <PDSBadge
                size="sm"
                appearance="subtle"
                :color="checkColor[run.state]"
              >
                {{ checkLabel[run.state] }}
              </PDSBadge>
              <a
                class="font-semibold underline-offset-2 hover:underline"
                :href="run.url"
                target="_blank"
                rel="noopener noreferrer"
              >{{ run.workflow }}</a>
              <span class="text-xs text-foreground-muted">{{ run.scope }} ({{ run.branch }}) · {{ run.event }} · {{ relativeTime(run.createdAt) }}</span>
            </li>
          </ul>
        </div>
      </PDSTabPanel>
    </PDSTabGroup>
  </div>
</template>
