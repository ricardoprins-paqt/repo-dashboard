import type { CiExplanation, CiOverview, CiRun } from '../../shared/types/ci'

const hour = 3_600_000
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * hour).toISOString()

function run(id: number, repo: string, state: 'success' | 'failure' | 'pending', hoursAgo: number, title = 'Update dependencies'): CiRun {
  return {
    id, repo, workflowId: repo === 'widgets' ? 1 : 2, workflow: 'Continuous Integration', path: '.github/workflows/ci.yml', branch: 'develop',
    event: 'push', status: state === 'pending' ? 'in_progress' : 'completed', conclusion: state === 'pending' ? null : state, state,
    sha: `${id}abcdef0123456789`, title, author: 'Ann de Vries', attempt: 1, createdAt: at(hoursAgo), startedAt: at(hoursAgo),
    updatedAt: at(hoursAgo), durationS: state === 'pending' ? null : 240, url: `https://github.com/acme/${repo}/actions/runs/${id}`,
  }
}

const red = [run(13, 'widgets', 'failure', 2), run(12, 'widgets', 'failure', 30, 'Upgrade the test runner'), run(11, 'widgets', 'success', 50)]
const green = [run(23, 'gadgets', 'pending', 0.1), run(22, 'gadgets', 'success', 5)]

export const ciOverviewFixture: CiOverview = {
  org: 'acme',
  sync: { running: false, lastSyncedAt: at(0.2), nextSyncAt: at(-0.8), lastError: null, done: 0, total: 0 },
  rows: [
    {
      repo: 'widgets', workflowId: 1, workflow: 'Continuous Integration', path: '.github/workflows/ci.yml', state: 'failure', running: false,
      last: red[0]!, failingSince: { run: red[1]!, count: 2, beforeHistory: false }, recent: red, avgDurationS: 240, previousAvgDurationS: 180,
    },
    {
      repo: 'gadgets', workflowId: 2, workflow: 'Continuous Integration', path: '.github/workflows/ci.yml', state: 'success', running: true,
      last: green[0]!, failingSince: null, recent: green, avgDurationS: 240, previousAvgDurationS: null,
    },
  ],
  noAccess: [{ name: 'secret-repo', defaultBranch: 'main', url: 'https://github.com/acme/secret-repo', access: 'none', error: 'Needs SSO authorisation for this organisation', checkedAt: at(0.2) }],
  explained: [],
}

export const ciExplanationFixture: CiExplanation = {
  runId: 13, createdAt: at(0), model: 'claude-test', steps: ['test › Run tests'],
  failed: 'Job test, step Run tests: tests/login.test.ts', cause: 'The new test runner no longer finds the setup file.',
  kind: 'code', fix: '1. Point setupFiles at tests/setup.ts.', confidence: 'medium', confidenceReason: 'The log shows the missing file.',
}
