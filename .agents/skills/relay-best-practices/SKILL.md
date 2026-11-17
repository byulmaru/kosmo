---
name: relay-best-practices
description: >-
  Apply Relay guidance to React or client modules using Relay for data fetching.
  Use when changing, reviewing, debugging, or explaining Relay hooks, GraphQL
  tags, pagination, mutations, or generated artifacts.
---

# Relay Best Practices

Use this skill for Relay implementation, review, debugging, or explanations.
Select references from the changed behavior; do not load every topic by default.

## Route

- Read the reference that matches the change: [architecture and compiler](references/architecture-compiler.md), [queries and fragments](references/queries-fragments.md), [mutations and errors](references/mutations-errors.md), [pagination and client state](references/pagination-client-state.md), or [anti-patterns](references/anti-patterns.md).
- For query placement, `@defer`, pagination, fetch policies, caching, or fragment granularity, also select the matching topic in [`relay-performance`](../relay-performance/SKILL.md).
- Read selected references completely, then the matching Relay LLM documentation page from `node_modules/relay-runtime/llm-docs/` (or the documented older-version source).
- Keep repository-specific route, environment, accessibility, and UI contracts in the repository's frontend memory.

## Documentation

Relay ships LLM-friendly docs in `node_modules/relay-runtime/llm-docs/`
(available after v20.1.1). For older versions, fetch the same files from
`https://raw.githubusercontent.com/facebook/relay/main/website/docs/`.
Read the page that matches the selected reference before changing code.

## Reference routing

- [Architecture and compiler](references/architecture-compiler.md): core philosophy, compiler workflow, lint rules, naming, and generated artifacts.
- [Queries and fragments](references/queries-fragments.md): root placement, ancestor walking, fragment data flow, and variable availability.
- [Mutations and errors](references/mutations-errors.md): response fragments, optimistic updates, errors, invalidation, staleness, store updates, and subscriptions.
- [Pagination and client state](references/pagination-client-state.md): pagination directives and Relay Resolvers.
- [Anti-patterns](references/anti-patterns.md): copied state, broken fragment colocation, and repeated mutation fields.
