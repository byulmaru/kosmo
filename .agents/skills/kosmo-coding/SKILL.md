---
name: kosmo-coding
description: Locate KOSMO-specific domain, API, runtime, design, and review criteria for repository changes.
---

# KOSMO Technical References

Use this index for KOSMO-specific engineering constraints. Read the relevant entrypoints and selected topic files in full before relying on them; skip unrelated domain topics.

## Technical topics

- General implementation principles, tests, API/client contracts, core services, and runtime tooling: [`memory/coding-style.md`](../../../memory/coding-style.md) and the topic files it selects.
- GraphQL resolver structure, object references, enums, Node IDs, and resolver style: [`memory/graphql-style.md`](../../../memory/graphql-style.md).
- Temporal Workflow/Activity ownership, shared effect settlement, aliases, and post-commit starts: [`memory/temporal-workflows.md`](../../../memory/temporal-workflows.md).
- Expo Router, React Native Web, React Relay, Storybook, and frontend behavior: [`memory/frontend-react-native.md`](../../../memory/frontend-react-native.md).
- PostgreSQL, Drizzle schema, and migration constraints: [`memory/database-design.md`](../../../memory/database-design.md) and [`memory/database-migrations.md`](../../../memory/database-migrations.md).
- Workspace scripts, CI, and command execution: [`memory/script.md`](../../../memory/script.md).

## Design, review, and authority

- For UI/product design or Figma changes, read the applicable `docs/design/*.md` and use [`kosmo-design-audit`](../kosmo-design-audit/SKILL.md) when auditing a Figma source.
- For KOSMO implementation or external PR reviews, use [`gh-review-coach`](../gh-review-coach/SKILL.md) and the matching topics from [`memory/review-style.md`](../../../memory/review-style.md).
- When a change relies on an OpenSpec artifact or alters a product contract, consult [`memory/issue-openspec-workflow.md`](../../../memory/issue-openspec-workflow.md) for the authority boundary. OpenSpec remains optional session context.
