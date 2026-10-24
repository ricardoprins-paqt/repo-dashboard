# repo-dashboard: rules for agents

- The Inbox and Lab loop pages show data that other tools own. Do not recompute their rules here:
  - Inbox (`/api/inbox`, from the lss-tools status service): use `item.needs_you`, `task.needs_you`, `sessions[].free`,
    `.reserved`, `.pinned`, `.loop` as given. The statuses and kinds in `shared/types/inbox.ts` must match
    `lss-tools/proxy/status/inbox.py` (a test in lss-tools checks this).
  - Lab loop (`server/lib/lab.ts` reads pds-backlog `loops/lab`): settings such as `minStarsToBuild` come from `loop.json`;
    whether an experiment is in `lab/main` is decided once in `lab.ts` (`inLabMain`).
- Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before committing; `pnpm test:e2e` for UI changes (in a separate checkout:
  a build in the service folder disturbs the running dev server).
