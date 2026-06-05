# AGENTS

## Workspace Rules

- Use `pnpm` for workspace and dependency management.
- Use CLI commands for `package.json` dependency changes. Non-dependency fields, such as `scripts`, may be edited directly.
- Use the Question tool when asking the user to decide between implementation options or unresolved requirements.
- Do not add a `Co-authored-by` trailer for the agent in commits or PR descriptions. The author of record is the human running the agent; agent attribution belongs in the PR body or Linear, not in the git trailer.

## Review Guidelines

- Write review comments and review summaries in Korean.

## OpenSpec Workflow

- When creating or updating OpenSpec specs before implementation, explain the resulting spec to the user in Korean.
- Before implementation, use the Question tool as much as practical to settle unresolved requirements and implementation choices.
- If additional unresolved requirements or implementation choices appear after an initial question round, ask follow-up questions repeatedly until the relevant decisions are settled.

## Memory

- Before working on a task, check whether any `memory/*.md` file applies to the topic.
- If a memory applies, use it as project-specific context while reviewing, implementing, or discussing the task.
- When a task changes the assumptions documented in a relevant memory file, update that memory in the same change.
- `memory/coding-style.md`: generalized coding style, API/client contract, spec sync, and runtime/tooling conventions.
- `memory/frontend-svelte.md`: Svelte, Mearie GraphQL fragment, Storybook, and frontend UI conventions.
- `memory/review-style.md`: Korean review comment style, priority labels, evidence, and review thread policy.
- `memory/commit-pr.md`: team commit, branch, stacked PR, and PR writing policy.
- `memory/script.md`: workspace scripts, command wrappers, and script execution behavior.
- `memory/database-design.md`: kosmo PostgreSQL/Drizzle database schema design and review context.
- `memory/graphql-style.md`: GraphQL resolver structure, object refs, enum registration, Node ID, and resolver style.

## `package.json` Changes

- Use `pnpm add`, `pnpm remove`, `pnpm add --save-dev`, or other `pnpm`-based CLI commands for dependency updates.
- Non-dependency manifest fields, including `scripts`, may be edited directly.
