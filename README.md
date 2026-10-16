# Repo dashboard

One page that shows the state of every git repository in your workspace, so you can decide what to do next without opening each repo. Built with Nuxt 4, the PAQT design system (`@paqtdesign/*`) and Tailwind CSS 4, from `paqt-nuxt-template`.

For each repository it combines local git state with GitHub data (through the `gh` CLI):

- **Git:** branch, ahead/behind the upstream, staged, unstaged, untracked and conflicted files, stashes, commits not pushed, commits waiting on the remote, local branches that are merged or whose remote branch is gone, and when the repo was last fetched.
- **GitHub:** open PRs with review state, checks and merge conflicts, review requests for you, the latest CI run per workflow on the default branch and the current branch, open issues.
- **Decisions:** all of the above is ranked into *critical*, *warning* and *info* findings, collected in a "What needs a decision" list across all repositories. The rules live in `server/lib/attention.ts`.

The app is read-only. The one exception is the **Fetch from remotes** button, which runs `git fetch --all --prune` in each repo (it never merges, pulls or pushes).

## Run it

Requirements: Node.js 24 and pnpm 10.34.7 (pinned in `mise.toml`, `.nvmrc` and `package.json`), `git`, and the [GitHub CLI](https://cli.github.com) logged in (`gh auth login`).

PAQT packages come from GitHub Packages, so installing needs a token with `read:packages`:

```sh
gh auth refresh -h github.com -s read:packages     # once, if your login lacks the scope
export NODE_AUTH_TOKEN="$(gh auth token)"
npm config set '//npm.pkg.github.com/:_authToken' '${NODE_AUTH_TOKEN}' --location=user   # once
pnpm install --frozen-lockfile
```

Then either:

```sh
pnpm dev                    # development server with hot reload
# or
pnpm build && pnpm start    # production build
```

The server listens on **http://127.0.0.1:3178**, loopback only. It runs `git` and `gh` against your repositories, so do not expose it on the network. On a remote machine, reach it through an SSH port forward (VS Code Remote-SSH forwards ports automatically), or:

```sh
ssh -L 3178:127.0.0.1:3178 <host>
```

To keep it running after you disconnect: `tmux new -d -s repo-dashboard 'pnpm start'`.

## Choosing which repositories to watch

By default it scans the direct subfolders of `~/workspace/paqtdesign` and `~/workspace/ricardoprins-paqt` and lists every one that is a git repository. Override with a colon-separated list:

```sh
REPO_DASHBOARD_ROOTS=~/workspace/paqtdesign:~/projects pnpm start
```

## Terminal view

The same data is available without the web app:

```sh
pnpm repos                      # summary with findings
pnpm repos --fetch              # git fetch everywhere first, for accurate ahead/behind
pnpm repos --no-github          # local git only, instant
pnpm repos --json               # everything, machine readable
```

## How it works

| Path | Purpose |
| --- | --- |
| `server/lib/git.ts` | Runs read-only git commands and parses their output |
| `server/lib/github.ts` | Reads PRs, checks and workflow runs with `gh` |
| `server/lib/attention.ts` | Turns raw data into ranked findings |
| `server/lib/collect.ts` | Finds repos and gathers everything, four repos at a time |
| `server/lib/cache.ts` | Short-lived cache (5 s local, 60 s with GitHub) shared by all browser tabs |
| `server/api/repos.get.ts`, `repos.post.ts` | `GET /api/repos?github=0\|1&refresh=1`, `POST /api/repos` (fetch) |
| `app/pages/index.vue` | The dashboard page |
| `app/utils/overview.ts` | Filtering, sorting and summary logic for the page |
| `scripts/repos-status.ts` | The terminal view |

The page paints local git state first (well under a second) and fills in GitHub data when it arrives. It refreshes itself every minute while the tab is visible, unless you turn off *Auto-refresh*.

`git` runs with `GIT_OPTIONAL_LOCKS=0` and `GIT_TERMINAL_PROMPT=0`, so reading status never blocks or interferes with your own git commands, and a repo that wants credentials fails fast instead of hanging.

## Styling

Tailwind utilities are backed by the design system tokens (see `app/assets/css/tailwind.css`): `bg-surface`, `text-foreground-muted`, `border-border`, `text-danger` and so on follow the PAQT theme in `app/assets/css/theme.css`. Interactive controls (buttons, badges, tabs, slideover, input, select, toggle) are PDS components.

Icons: `app/plugins/icons.client.ts` registers a bundled Lucide subset so PDS components do not call the Iconify API, and every icon in the app is a `PDSIcon`. Add a name to `app/utils/icons.ts` when you need a new icon.

## Checks

| Command | Purpose |
| --- | --- |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Nuxt and TypeScript types |
| `pnpm test` | Unit tests (`tests/unit`) and Nuxt component tests (`tests/nuxt`) |
| `pnpm test:e2e` | Browser tests against the production build, with a mocked API (`tests/e2e`) |
| `pnpm check` | All of the above plus the build |

Install the browser once with `pnpm exec playwright install chromium`. The e2e tests serve the build on port 3179 and never read your real repositories.

## Known limitations

- GitHub data only covers repositories whose `origin` is on github.com. Others show git data and a "No GitHub data" badge.
- `PDSInput` does not pass `aria-label` on to the inner `<input>` in the current `@paqtdesign/vue` (1.8.1), so its placeholder is what assistive technology reads. `PDSSelect` and `PDSToggle` take the same prop and were not checked.
