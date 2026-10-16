import { describe, expect, it } from 'vitest'
import { latestRunPerWorkflow, runState, summarizeChecks } from '../../server/lib/github'

const check = (status: string, conclusion: string | null = null) => ({ __typename: 'CheckRun', status, conclusion })

describe('summarizeChecks', () => {
  it('reports none without checks', () => {
    expect(summarizeChecks([])).toBe('none')
    expect(summarizeChecks(null)).toBe('none')
  })

  it('reports success when everything passed or was skipped', () => {
    expect(summarizeChecks([check('COMPLETED', 'SUCCESS'), check('COMPLETED', 'SKIPPED'), check('COMPLETED', 'NEUTRAL')])).toBe('success')
  })

  it('lets a failure win over pending checks', () => {
    expect(summarizeChecks([check('IN_PROGRESS'), check('COMPLETED', 'FAILURE')])).toBe('failure')
  })

  it('reports pending while anything is still running', () => {
    expect(summarizeChecks([check('COMPLETED', 'SUCCESS'), check('QUEUED')])).toBe('pending')
  })

  it('understands commit statuses', () => {
    expect(summarizeChecks([{ __typename: 'StatusContext', state: 'FAILURE' }])).toBe('failure')
    expect(summarizeChecks([{ __typename: 'StatusContext', state: 'PENDING' }])).toBe('pending')
    expect(summarizeChecks([{ __typename: 'StatusContext', state: 'SUCCESS' }])).toBe('success')
  })

  it.each(['CANCELLED', 'TIMED_OUT', 'STARTUP_FAILURE', 'ACTION_REQUIRED'])('treats %s as a failure', (conclusion) => {
    expect(summarizeChecks([check('COMPLETED', conclusion)])).toBe('failure')
  })
})

describe('runState', () => {
  it('maps run status and conclusion', () => {
    expect(runState('in_progress', null)).toBe('pending')
    expect(runState('completed', 'success')).toBe('success')
    expect(runState('completed', 'failure')).toBe('failure')
    expect(runState('completed', 'startup_failure')).toBe('failure')
    expect(runState('completed', 'cancelled')).toBe('none')
    expect(runState('completed', 'skipped')).toBe('none')
  })
})

describe('latestRunPerWorkflow', () => {
  const run = (workflowName: string, createdAt: string, conclusion: string) => ({
    workflowName, createdAt, conclusion, status: 'completed', headBranch: 'main', event: 'push', url: `https://example.test/${workflowName}/${createdAt}`,
  })

  it('keeps only the newest run of each workflow', () => {
    const runs = latestRunPerWorkflow([
      run('CI', '2026-10-01T10:00:00Z', 'success'),
      run('CI', '2026-10-02T10:00:00Z', 'failure'),
      run('Deploy', '2026-09-30T10:00:00Z', 'success'),
    ])

    expect(runs.map(item => [item.workflow, item.state])).toEqual([['CI', 'failure'], ['Deploy', 'success']])
  })
})
