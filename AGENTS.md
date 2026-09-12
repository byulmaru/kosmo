# AGENTS

## Workspace Rules

- Use `pnpm` for workspace and dependency management.
- Use CLI commands for `package.json` dependency changes. Non-dependency fields, such as `scripts`, may be edited directly.
- Use the Question tool when an unresolved product, contract, security, rollout, ownership, or other materially different choice needs the user's decision. Treat explicit user instructions and existing canonical contract as settled input; do not repeat a question for routine in-scope choices.
- Do not add a `Co-authored-by` trailer for the agent in commits or PR descriptions. The author of record is the human running the agent; agent attribution belongs in the PR body or Linear, not in the git trailer.

## GitHub Stacked Pull Requests

- Create every new pull request, including a standalone pull request, as a one-layer-or-larger Stack with the official `github/gh-stack` extension.
- Before branch or pull request work, verify the extension with `gh extension list` and `gh stack --version`; if it is missing, install it for the current user. Use `gh stack`, never an ordinary unstacked PR fallback.
- Start the first layer from the latest `main` with `gh stack init --base main <branch>` and add later layers from the current top with `gh stack add <branch>`. Feature and contract branches use their Linear issue ID; behavior-preserving refactors may use a descriptive branch.
- Push and submit through `gh stack push` and `gh stack submit`. If the extension is unavailable or fails, report the blocker and observed state without switching tools.
- Detailed branch, Stack, REST verification, Draft/Ready, auto-merge, merge-queue and closeout rules live in [`memory/git-pr-workflow.md`](memory/git-pr-workflow.md); rebase and reparent rules live in [`memory/git-stack-maintenance.md`](memory/git-stack-maintenance.md).

## CodeGraph In Linked Worktrees

- For this repository, consider CodeGraph initialized only when the current worktree contains
  `.codegraph/codegraph.db`; a directory containing only `.gitignore` is not initialized. Use CodeGraph only for read-only structural lookup when it helps the current task, and verify changed paths directly.
- Do not initialize a linked worktree without approval. Follow [`memory/tooling/worktrees.md`](memory/tooling/worktrees.md#codegraph-in-linked-worktrees) for shared-baseline freshness and changed-path checks; otherwise use current-worktree reads and targeted searches.

## Review Guidelines

- Write review comments and review summaries in Korean.

## Tests

- Test executed behavior: inputs, outputs, state changes, and failure paths. Do not substitute source-text checks for behavior; use [memory/coding/tests.md](memory/coding/tests.md) for the boundary between implementation inspection and legitimate observable text assertions.
- Use standard linters/validators for syntax and configuration checks.

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

- Completion means the scoped implementation, required documentation and focused validation are finished, including repairs for failures caused by the change. Continue through that work before reporting the first working patch as done; keep optional follow-ups separate from required completion.
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
- Before implementation, use the Question tool for unresolved requirements or choices that would change observable behavior, public contracts, security, production or rollout, ownership, or the completion boundary. Continue with routine implementation choices that stay within the user's request and existing contract.
- If such a material decision appears after work has started, stop at that decision boundary, present the alternatives and impact, and continue once it is settled. Do not reopen a settled decision.

## Memory

- For repository implementation or review work, use [`.agents/skills/kosmo-coding/SKILL.md`](.agents/skills/kosmo-coding/SKILL.md) and its routing instructions.
- For repository implementation or review work, read the applicable memory entrypoint and only the topic documents that shape the current task; read each selected document from beginning to end. Do not read unrelated topics or a full repository map by default. For docs-only or mechanical changes, inspect the affected guidance and validation instructions instead. If the scope changes, select and read newly applicable topics before continuing.
- When a task changes the assumptions documented in a relevant memory file, update that memory in the same change.
- `memory/coding-style.md`: common coding router; follow its conditions to select directly applicable coding topics.
- `memory/issue-openspec-workflow.md`: issue-first planning, OpenSpec ownership and granularity,
  implementation boundaries, and completion gates.
- `memory/frontend-react-native.md`: short entrypoint for Expo Router, React Native Web, React Relay, Storybook, and frontend UI topics.
- `memory/review-style.md`: Korean review index for comment style, priority labels, and evidence policy; select and read the applicable `memory/review/` topics.
- `memory/commit-pr.md`: short router for commit, branch, stacked PR, and PR writing policy. Read this first, then load the specific memory it points to.
- `memory/commit-policy.md`: commit unit, staging scope, and commit message conventions.
- `memory/git-pr-workflow.md`: official Git/GitHub CLI branch, commit, push, PR, and basic stacked PR workflow.
- `memory/git-stack-maintenance.md`: official Git stack maintenance for rebase, reparent, squash-merge continuation, and force-push safety.
- `memory/pr-writing.md`: Korean PR title/body, scope, Draft PR, and dependency explanation policy.
- `memory/review-thread.md`: unresolved review thread handling and merge-readiness policy.
- `memory/script.md`: short entrypoint for workspace scripts, command wrappers, and execution validation.
- `memory/database-design.md`: short entrypoint for kosmo PostgreSQL/Drizzle schema design and review topics.
- `memory/database-migrations.md`: short entrypoint for additive와 breaking DB 변경 분류, expand/transition/contract
  이슈·PR·배포 순서, backfill과 contract gate.
- `memory/graphql-style.md`: short entrypoint for GraphQL resolver structure, object refs, enum registration, Node ID, and resolver style.
- `memory/temporal-workflows.md`: short entrypoint for Temporal Workflow structure, shared effect settlement, Activity aliases, and post-commit start.

## Design Docs

- Before working on UI/product design tasks (design implementation, Figma work, style changes), check `docs/design/*.md`.
- When a change alters a documented design decision, update the relevant `docs/design` document in the same change.

## `package.json` Changes

- Use `pnpm add`, `pnpm remove`, `pnpm add --save-dev`, or other `pnpm`-based CLI commands for dependency updates.
- Non-dependency manifest fields, including `scripts`, may be edited directly.
