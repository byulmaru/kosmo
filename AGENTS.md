# AGENTS

## Workspace Rules

- Use `pnpm` for workspace and dependency management.
- Use CLI commands for `package.json` dependency changes. Non-dependency fields, such as `scripts`, may be edited directly.

## Review Guidelines

- Write review comments and review summaries in Korean.

## Memory

- Before working on a task, check whether any `memory/*.md` file applies to the topic.
- If a memory applies, use it as project-specific context while reviewing, implementing, or discussing the task.
- When a task changes the assumptions documented in a relevant memory file, update that memory in the same change.
- `memory/commit-pr.md`: team commit, branch, stacked PR, and PR writing policy.
- `memory/script.md`: workspace scripts, command wrappers, and script execution behavior.
- `memory/database-design.md`: kosmo PostgreSQL/Drizzle database schema design and review context.

## `package.json` Changes

- Use `pnpm add`, `pnpm remove`, `pnpm add --save-dev`, or other `pnpm`-based CLI commands for dependency updates.
- Non-dependency manifest fields, including `scripts`, may be edited directly.
