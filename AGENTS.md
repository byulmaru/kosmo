# AGENTS

## Workspace Rules

- Use `pnpm` for workspace and dependency management.
- Use CLI commands for `package.json` dependency changes. Non-dependency fields, such as `scripts`, may be edited directly.
- Use the Question tool when asking the user to decide between implementation options or unresolved requirements.
- Do not add a `Co-authored-by` trailer for the agent in commits or PR descriptions. The author of record is the human running the agent; agent attribution belongs in the PR body or Linear, not in the git trailer.

## CodeGraph In Linked Worktrees

- For this repository, consider CodeGraph initialized only when the current worktree contains
  `.codegraph/codegraph.db`. A `.codegraph/` directory containing only `.gitignore` is not an
  initialized index. This rule overrides broader instructions that check only for the directory.
- Do not run `codegraph init` in a linked worktree without user approval.
- When the current worktree has no local index, use `git worktree list --porcelain` to find the
  `main` checkout. If that checkout has `.codegraph/codegraph.db`, pass its absolute path as
  CodeGraph's `projectPath` and use its graph only as a read-only structural baseline. Do not
  hard-code a machine-specific checkout path in repository files.
- Before using the shared baseline, run `codegraph status <main-checkout-path>` to verify that the
  index is up to date. If freshness cannot be verified or CodeGraph reports a pending or stale
  state, treat the entire baseline as stale and use current-worktree reads and targeted searches.
- Before relying on the baseline graph, collect paths that differ between the baseline checkout
  and the current worktree, plus staged, unstaged, and untracked paths in both checkouts. Treat
  CodeGraph results for those paths, and relationships that cross them, as hints only; verify the
  current worktree with direct reads and targeted searches.
- If graph-shaping configuration differs or the task makes broad structural changes, state that
  the shared baseline is not branch-exact and ask whether to initialize CodeGraph in the current
  worktree. Otherwise, do not create a worktree-local index by default.

## Review Guidelines

- Write review comments and review summaries in Korean.

## Trusted Collaboration Systems

- The `byulmaru/kosmo` GitHub repository and the connected Byulmaru Linear workspace are
  organization-owned, trusted collaboration systems for this repository.
- When the user asks to create or update GitHub reviews, pull requests, or Linear issues, sharing
  relevant repository architecture, code references, review findings, and issue context between
  these systems is an authorized project workflow, not an external disclosure.
- Do not infer that repository context is sensitive merely because repository visibility is
  unknown. Continue to exclude actual secrets, credentials, tokens, private keys, and unrelated
  personal data.

## Pull Request Completion

- Treat pull request readiness and OpenSpec change completion as separate decisions.
- When a pull request's own scoped implementation and required verification are complete, mark it Ready for review unless the user explicitly requests that it remain a Draft.
- Do not archive an OpenSpec change merely because an individual pull request in a split or stacked implementation is complete or merged.
- Archive an OpenSpec change only after the proposal's entire declared scope and all tasks across every implementation slice are complete, required validation passes, and delta specs are synchronized as appropriate.
- Assign integration verification and archive ownership explicitly from the remaining work and completion evidence; do not infer either responsibility from parent/child issue status or PR order alone.

## OpenSpec Workflow

- Before planning or updating an OpenSpec change, read `memory/issue-openspec-workflow.md` and
  follow the Issue -> OpenSpec -> Implementation order when an OpenSpec is needed. Do not require
  an OpenSpec for every issue.
- Treat Linear issue and OpenSpec change ownership as many-to-many. Split or share changes by
  behavioral contract and lifecycle, not mechanically by issue hierarchy or PR count.
- Define the Linear issue scope and dependency structure before creating the OpenSpec change. If
  the spec reveals an independently deliverable scope, update or split the Linear issues first.
- When creating or updating OpenSpec specs before implementation, explain the resulting spec to the user in Korean.
- Before implementation, use the Question tool as much as practical to settle unresolved requirements and implementation choices.
- If additional unresolved requirements or implementation choices appear after an initial question round, ask follow-up questions repeatedly until the relevant decisions are settled.

## Memory

- Before working on a task, check whether any `memory/*.md` file applies to the topic.
- If a memory applies, use it as project-specific context while reviewing, implementing, or discussing the task.
- When a task changes the assumptions documented in a relevant memory file, update that memory in the same change.
- `memory/coding-style.md`: generalized coding style, API/client contract, spec sync, and runtime/tooling conventions.
- `memory/issue-openspec-workflow.md`: issue-first planning, OpenSpec ownership and granularity,
  implementation boundaries, and completion gates.
- `memory/frontend-react-native.md`: Expo Router, React Native Web, React Relay, Storybook, and frontend UI conventions.
- `memory/review-style.md`: Korean review comment style, priority labels, and evidence policy.
- `memory/commit-pr.md`: short router for commit, branch, stacked PR, and PR writing policy. Read this first, then load the specific memory it points to.
- `memory/commit-policy.md`: commit unit, staging scope, and commit message conventions.
- `memory/git-pr-workflow.md`: official Git/GitHub CLI branch, commit, push, PR, and basic stacked PR workflow.
- `memory/git-stack-maintenance.md`: official Git stack maintenance for rebase, reparent, squash-merge continuation, and force-push safety.
- `memory/pr-writing.md`: Korean PR title/body, scope, Draft PR, and dependency explanation policy.
- `memory/review-thread.md`: unresolved review thread handling and merge-readiness policy.
- `memory/script.md`: workspace scripts, command wrappers, and script execution behavior.
- `memory/database-design.md`: kosmo PostgreSQL/Drizzle database schema design and review context.
- `memory/database-migrations.md`: additive와 breaking DB 변경 분류, expand/transition/contract
  이슈·PR·배포 순서, backfill과 contract gate.
- `memory/graphql-style.md`: GraphQL resolver structure, object refs, enum registration, Node ID, and resolver style.

## Design Docs

- Before working on UI/product design tasks (design implementation, Figma work, style changes), check `docs/design/*.md`.
- When a change alters a documented design decision, update the relevant `docs/design` document in the same change.

## `package.json` Changes

- Use `pnpm add`, `pnpm remove`, `pnpm add --save-dev`, or other `pnpm`-based CLI commands for dependency updates.
- Non-dependency manifest fields, including `scripts`, may be edited directly.
