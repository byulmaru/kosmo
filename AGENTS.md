# AGENTS

## Workspace Rules

- Use `bun` for workspace and dependency management.
- Never edit any `package.json` file by hand. Make changes through the appropriate CLI instead.

## Skills

- When preparing commits, branches, or pull requests, use the `byulmaru:commit-pr` skill provided by the Codex plugin.
- Make speculative commits frequently so intermediate hypotheses, pivots, and recovery points are preserved.

## Review Guidelines

- Write review comments and review summaries in Korean.

## `package.json` Changes

- Use `bun add`, `bun remove`, `bun add --dev`, or other `bun`-based CLI commands for manifest updates.
- If a script or field must change, update it through CLI tooling rather than directly editing the file contents.
