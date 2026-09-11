---
name: relay-best-practices
description: >-
  Best practices for writing idiomatic Relay code. ALWAYS use this skill when
  writing or modifying React components that use Relay for data fetching. Covers
  fragments, queries, mutations, pagination, and common anti-patterns. Use when
  you see `useFragment`, `useLazyLoadQuery`, `usePreloadedQuery`, `useMutation`,
  `usePaginationFragment`, `graphql` template literals, `react-relay` imports,
  or `__generated__/*.graphql` files. Also use when asked to explain Relay
  concepts, debug Relay issues, or review Relay code.
---

# Relay Best Practices

Relay favors colocated, masked, composable fragments, render-as-you-fetch, and
an ID-keyed normalized store. Use this skill for Relay implementation, review,
debugging, and explanations.

When this skill applies, identify the relevant topic reference below and read
each selected reference in full before writing code. Then read the matching
Relay LLM documentation page. Keep repository-specific route, environment,
accessibility, and UI contracts in the repository's frontend memory.

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

For query placement, `@defer`, pagination, fetch policies, caching, and
fragment granularity, also use the companion
[`relay-performance`](../relay-performance/SKILL.md) skill.
