# AGENTS

## Workspace Rules

- Use `pnpm` for workspace and dependency management.
- Use CLI commands for `package.json` dependency changes. Non-dependency fields, such as `scripts`, may be edited directly.
- Use the Question tool when an unresolved product, contract, security, rollout, ownership, or other materially different choice needs the user's decision. Treat explicit user instructions and existing canonical contract as settled input; do not repeat a question for routine in-scope choices.
- Do not add a `Co-authored-by` trailer for the agent in commits or PR descriptions. The author of record is the human running the agent; agent attribution belongs in the PR body or Linear, not in the git trailer.

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
- Required CI checks are part of PR completion and must pass on the latest PR head. Pending, failed, blocked, or unavailable checks are not passing evidence; report the exact unresolved state.
- CI proves only the behavior covered by its checks. Keep production, deployment, and device evidence separate when those surfaces were not verified.

## Product Authority And OpenSpec

- `docs/domain` and accepted ADRs own product behavior, permissions, state transitions, security, compatibility, and rollout contracts. `docs/design` owns visual structure, presentation, accessibility, and interaction design.
- Linear records the problem, value, delivery scope, and outcome-level completion conditions. Code, tests, and PRs record implementation and verification evidence.
- OpenSpec is an optional, mutable session aid. It does not add product requirements, override settled user or canonical decisions, or create implementation or PR completion gates.
- Ask about unresolved choices that would change observable behavior, public contracts, security, rollout, ownership, or completion scope. Do not promote an OpenSpec note or implementation preference into a durable requirement.

## Memory

- For repository implementation or review work, use [`.agents/skills/kosmo-coding/SKILL.md`](.agents/skills/kosmo-coding/SKILL.md) and its routing instructions.
- Read only the memory topics that apply to the current task, and read each selected topic fully. For docs-only or mechanical changes, inspect the affected guidance and validation instructions instead of unrelated domain topics.
- When a task changes the assumptions documented in a relevant memory file, update that memory in the same change.
- `memory/coding-style.md` routes to directly applicable implementation topics. `memory/issue-openspec-workflow.md` records the canonical, Linear, and OpenSpec authority split.

## Design Docs

- Before working on UI/product design tasks (design implementation, Figma work, style changes), check `docs/design/*.md`.
- When a change alters a documented design decision, update the relevant `docs/design` document in the same change.

## `package.json` Changes

- Use `pnpm add`, `pnpm remove`, `pnpm add --save-dev`, or other `pnpm`-based CLI commands for dependency updates.
- Non-dependency manifest fields, including `scripts`, may be edited directly.
