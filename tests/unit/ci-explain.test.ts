import { describe, expect, it } from 'vitest'
import { buildPrompt, parseAnswer, redactSecrets, trimLog } from '../../server/lib/ci-explain'

describe('redactSecrets', () => {
  it.each([
    ['token ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'ghp_'],
    ['github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz', 'github_pat_'],
    ['AWS AKIAIOSFODNN7EXAMPLE used', 'AKIAIOSFODNN7EXAMPLE'],
    ['curl https://deploy:s3cr3tpass@example.com/x', 's3cr3tpass'],
    ['Authorization: Bearer abc.def.ghi-jkl-mno-pqr', 'abc.def'],
    ['DB_PASSWORD=hunter2hunter2', 'hunter2'],
    ['"client_secret": "zyx987wvu654"', 'zyx987'],
    ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', 'eyJhbGci'],
    ['key Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LzXcVbNm', 'Zx9Qw8'],
    ['-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----', 'MIIEow'],
  ])('removes %s', (text, secret) => {
    expect(redactSecrets(text)).not.toContain(secret)
  })

  it('keeps commit ids, paths and ordinary words', () => {
    const text = 'commit 54898b74c23fde5556c9b3c3a2290865feef0dfe in src/components/LoginForm.vue: author Ann, 3 tokens used'
    expect(redactSecrets(text)).toBe(text)
  })
})

describe('trimLog', () => {
  it('drops timestamps and colour codes and starts at the failing step', () => {
    const log = [
      '2026-11-06T10:00:00.0000000Z ##[group]Run actions/checkout@v4',
      '2026-11-06T10:00:01.0000000Z checked out',
      '2026-11-06T10:00:02.0000000Z ##[group]Run pnpm test',
      '2026-11-06T10:00:03.0000000Z \u001B[31mFAIL\u001B[0m tests/login.test.ts',
      '2026-11-06T10:00:04.0000000Z ##[error]Process completed with exit code 1.',
      '2026-11-06T10:00:05.0000000Z Post job cleanup.',
    ].join('\n')
    const trimmed = trimLog(log)
    expect(trimmed).toContain('(2 earlier lines left out)')
    expect(trimmed).toContain('##[group]Run pnpm test\nFAIL tests/login.test.ts\n##[error]Process completed')
    expect(trimmed).not.toContain('checkout')
  })

  it('keeps the end of a long log without error markers', () => {
    const log = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n')
    const trimmed = trimLog(log, 250, 100)
    expect(trimmed).toContain('line 999')
    expect(trimmed).not.toContain('line 899\n')
  })
})

describe('parseAnswer', () => {
  it('reads the JSON answer, also inside a code fence', () => {
    const answer = parseAnswer('```json\n{"failed":"test","cause":"broken","kind":"flaky","fix":"retry","confidence":"high","confidenceReason":"clear"}\n```')
    expect(answer).toEqual({ failed: 'test', cause: 'broken', kind: 'flaky', fix: 'retry', confidence: 'high', confidenceReason: 'clear' })
  })

  it('falls back to the text with low confidence', () => {
    expect(parseAnswer('I think the test broke.')).toMatchObject({ cause: 'I think the test broke.', kind: 'unknown', confidence: 'low' })
  })
})

describe('buildPrompt', () => {
  it('redacts secrets from everything it sends', () => {
    const prompt = buildPrompt({
      run: { id: 1, repo: 'app', workflowId: 1, workflow: 'CI', path: '.github/workflows/ci.yml', branch: 'develop', event: 'push', status: 'completed', conclusion: 'failure', state: 'failure', sha: 'abcdef1234', title: 'x', author: 'Ann', attempt: 1, createdAt: '', startedAt: '', updatedAt: '', durationS: 1, url: '' },
      jobs: [{ name: 'test', failedSteps: ['Run tests'], log: 'export NPM_TOKEN=npm_abcdefghijklmnopqrstuvwxyz0123456789' }],
      workflowFile: 'on: push',
      commit: { message: 'x', files: ['modified a.ts'] },
      history: [],
    })
    expect(prompt).toContain('Failed steps: Run tests')
    expect(prompt).not.toContain('npm_abcdef')
  })
})
