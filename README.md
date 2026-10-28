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
| `app/utils/markdown.ts` | Renders Markdown attachments (`/attachments/<id>`) as HTML; raw HTML in them is escaped, never run |
| `server/lib/files.ts`, `server/api/files/` | The `/files?path=` page: a file or folder under `~/workspace` (Markdown formatted, images and PDFs shown, folders with an image gallery) |
| `server/lib/inbox-files.ts`, `app/utils/links.ts` | Inbox items: file anchors and paths in the text that exist become links to `/files`, URLs become links |
| `scripts/repos-status.ts` | The terminal view |

The page paints local git state first (well under a second) and fills in GitHub data when it arrives. It refreshes itself every minute while the tab is visible, unless you turn off *Auto-refresh*.

`git` runs with `GIT_OPTIONAL_LOCKS=0` and `GIT_TERMINAL_PROMPT=0`, so reading status never blocks or interferes with your own git commands, and a repo that wants credentials fails fast instead of hanging.

## Styling

Tailwind utilities are backed by the design system tokens (see `app/assets/css/tailwind.css`): `bg-surface`, `text-foreground-muted`, `border-border` and so on follow the PAQT theme. The status colors (`success`, `warning`, `danger`, `info`) only exist in the theme sheet, not in `tokens.css`, and so do their readable `-text` versions (`text-danger-text` etc.), which the theme only defines inside the components' shadow DOM, so `tailwind.css` repeats the same formula.

**Theme.** `app/assets/css/theme.css` is the single theme file: it imports core's `[color]`/`[appearance]` recipe sheet (`@paqtdesign/core/theme.css`), then `brand-theme.css` (generated by token-forge, kept verbatim), then the app font. It is registered as `customTheme` and also loaded globally, after `tokens.css` (imported explicitly, with the module's `autoImportCss` turned off). Keep every token override in that one file: the module adopts the `customTheme` file into `document.adoptedStyleSheets`, which outranks all normal stylesheets, so a token set anywhere else loses to core's defaults. To re-theme, replace `brand-theme.css` with a new token-forge export.

Dark mode: the header has a toggle. It sets `data-theme` on `<html>`, remembers the choice in `localStorage` and starts from the OS preference when nothing is stored. A small script in `<head>` (`THEME_INIT_SCRIPT` in `app/composables/useTheme.ts`) applies it before the first paint, so there is no flash. `theme.css` adds what the generated theme lacks for dark: `color-scheme` and a dark `--pds-text-lightness` (the readable status colors would be far too dark on a dark surface). Tailwind's `dark:` variant follows `data-theme`, and is used to invert the logo.

Components: cards (`PDSCard`), buttons, badges, tabs, slideover, input, select and toggle come from `@paqtdesign/vue`. The error callout (`PDSExpCallout`) comes from `@paqtdesign/experimental`, which `@paqtdesign/nuxt` does not know about, so `nuxt.config.ts` bundles it for SSR the same way the module does for `@paqtdesign/vue`. Import experimental components explicitly from `@paqtdesign/experimental/vue`.

`PDSCard` has no click support, so each card (and summary tile) contains a native `<button>` stretched over the whole card with an `after:absolute after:inset-0` pseudo-element. The card is then one click target and one tab stop, and the repo name stays a real heading.

Icons: `app/plugins/icons.client.ts` registers a bundled Lucide subset (listed in `app/utils/icons.ts`) so `PDSIcon` does not call the Iconify API. It uses `iconify-icon` directly, because importing PDS's `registerIconCollection` defines `<pds-icon>` first, which already starts the remote lookups.

## Files

Inbox items often point to a file or folder (a report, a plan, a folder of screenshots). `/files?path=<path>` shows it, so
nobody needs a terminal to find it. A relative path (`pds-backlog/reports/x.md`, `packages/vue/...`) is looked up in the
checkouts under `~/workspace`, first in the item's own session folder, then the hubs; a bare name counts only when one place
has it. Only files under `~/workspace` (or `REPO_DASHBOARD_FILES_ROOT`) are served, never hidden ones (`.env`, `.git`, ...)
or keys, and only to a local Host. Raw files are sandboxed (an SVG or HTML file cannot run script on the dashboard), except
PDFs, which the browser's viewer needs.

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
- `aria-*` attributes do not reach the real control in `@paqtdesign/vue` 1.8.1. `PDSInput`, `PDSSelect`, `PDSCheckbox` and `PDSToggle` declare `aria-label`, `aria-labelledby` and `aria-describedby` as props but never render them (and a declared prop is removed from the pass-through attributes). `PDSButton` renders its own inner `<button>` without forwarding anything, so `aria-label` and `aria-pressed` set on it land on the `<pds-button>` host, where they do nothing, which includes the documented `<PDSButton square aria-label="Settings">` example (an unnamed button). The dashboard works around it with `sr-only` text inside the button's slot (theme toggle, "(selected)" on the active filter chip).
- Some Vue wrappers render boolean props differently on the server than on the client (`PDSButton` `loading=""` vs `"false"`, `PDSToggle` a stray `size`), which Vue reports as a hydration mismatch. The buttons pass `undefined` instead of `false`, and the toggle is wrapped in `<ClientOnly>`. The mechanism was not investigated.
- `<pds-icon>` draws only while it is on screen. Its inner `iconify-icon` renders through an `IntersectionObserver` and clears the drawing when the icon leaves the viewport (`pds-icon` does not set `noobserver`), so icons below the fold are blank in full-page screenshots, printing and e2e snapshots. Scrolling is enough to show them. An icon right at the viewport edge occasionally stayed blank in testing; not investigated.
