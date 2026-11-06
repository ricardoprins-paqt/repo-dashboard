import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FocusPr, PrChecks } from '../../shared/types/focus.ts'

const execFileAsync = promisify(execFile)

/** The GitHub search for open, non-draft PRs in these repos ("org/repo" or "org/*"; several qualifiers mean either one). */
export function searchQuery(repos: string[]): string {
  const scope = repos.map(r => r.trim()).filter(Boolean).map(r => (r.endsWith('/*') ? `org:${r.slice(0, -2)}` : `repo:${r}`))
  return ['is:pr', 'is:open', 'draft:false', 'archived:false', ...scope].join(' ')
}

export interface RawPr {
  number: number
  title: string
  url: string
  isDraft: boolean
  createdAt: string
  author: { login: string } | null
  repository: { nameWithOwner: string }
  labels: { nodes: Array<{ name: string }> }
  latestReviews: { nodes: Array<{ state: string, author: { login: string, __typename?: string } | null }> }
  reviewRequests: { nodes: Array<{ requestedReviewer: { __typename?: string, login?: string } | null }> }
  commits: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }> }
}

function checksOf(pr: RawPr): PrChecks {
  const state = pr.commits.nodes[0]?.commit.statusCheckRollup?.state?.toUpperCase()
  if (!state) return 'none'
  if (state === 'SUCCESS') return 'success'
  if (state === 'FAILURE' || state === 'ERROR') return 'failure'
  return 'pending'
}

/**
 * Sorts PRs into Ricardo's two lists. "review": his review is requested, or it is a careful-lane PR by someone else without his
 * approval. "quick": a fast-lane PR without any human approval yet (anyone may approve it). Every PR needs at least one human
 * approval; nothing is merged automatically, so a PR with a human approval drops off "quick".
 */
export function classifyPrs(raw: RawPr[], viewer: string | null): { review: FocusPr[], quick: FocusPr[] } {
  const review: FocusPr[] = []
  const quick: FocusPr[] = []
  const me = viewer?.toLowerCase() ?? null
  for (const pr of raw) {
    if (pr.isDraft) continue
    const labels = pr.labels.nodes.map(l => l.name.toLowerCase())
    const lane = labels.includes('lane: careful') ? 'careful' : labels.includes('lane: fast') ? 'fast' : null
    const author = pr.author?.login ?? 'unknown'
    const approvals = pr.latestReviews.nodes.filter(r => r.state === 'APPROVED' && r.author && r.author.__typename !== 'Bot' && r.author.login !== author)
    const approvedByMe = approvals.some(r => r.author?.login.toLowerCase() === me)
    const requested = me !== null && pr.reviewRequests.nodes.some(r => r.requestedReviewer?.__typename === 'User' && r.requestedReviewer.login?.toLowerCase() === me)
    const base = { repo: pr.repository.nameWithOwner, number: pr.number, title: pr.title, url: pr.url, author, created: pr.createdAt, lane, checks: checksOf(pr) } as const
    if (requested) review.push({ ...base, reason: 'requested' })
    else if (lane === 'careful' && author.toLowerCase() !== me && !approvedByMe) review.push({ ...base, reason: 'careful' })
    else if (lane === 'fast' && !approvals.length) quick.push({ ...base, reason: 'fast' })
  }
  const oldest = (a: FocusPr, b: FocusPr) => a.created.localeCompare(b.created)
  return { review: review.sort(oldest), quick: quick.sort(oldest) }
}

const QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title url isDraft createdAt
      author { login }
      repository { nameWithOwner }
      labels(first: 20) { nodes { name } }
      latestReviews(first: 30) { nodes { state author { login __typename } } }
      reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    } }
  }
}`

/** All open, non-draft PRs in these repos, through the gh CLI the dashboard already uses (at most 300). */
export async function searchPrs(repos: string[]): Promise<RawPr[]> {
  const out: RawPr[] = []
  let after: string | null = null
  for (let page = 0; page < 3; page++) {
    const args: string[] = ['api', 'graphql', '-f', `query=${QUERY}`, '-f', `q=${searchQuery(repos)}`, ...(after ? ['-f', `after=${after}`] : [])]
    const { stdout }: { stdout: string } = await execFileAsync('gh', args, { timeout: 30_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } })
    const search: { pageInfo: { hasNextPage: boolean, endCursor: string | null }, nodes: RawPr[] } = (JSON.parse(stdout) as { data: { search: { pageInfo: { hasNextPage: boolean, endCursor: string | null }, nodes: RawPr[] } } }).data.search
    out.push(...search.nodes.filter((n: RawPr | null) => n && n.number))
    if (!search.pageInfo.hasNextPage) break
    after = search.pageInfo.endCursor
  }
  return out
}
