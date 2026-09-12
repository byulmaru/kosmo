---
name: relay-performance
description: >-
  Optimize Relay fetching, rendering, caching, pagination, or fragment
  granularity. Use for network cost, re-renders, freshness, or first paint.
---

# Relay Performance Best Practices

Use this skill for Relay data-fetching, rendering, caching, and re-render
performance. Select only the references that match the performance question.
For correctness, naming, and architecture, also use the companion
[`relay-best-practices`](../relay-best-practices/SKILL.md) skill.

Read selected references in full before changing code, then read the matching
page from `<llm-docs>/`; it is available in
`node_modules/relay-runtime/llm-docs/` after v20.1.1.

## Reference routing

- [Query and rendering](references/query-rendering.md): root query count, preload timing, and `@defer`.
- [Cache and fetch](references/cache-fetch.md): fetch policies, garbage collection, server filtering, bounded collections, and refetches.
- [Fragments and connections](references/fragments-connections.md): fragment granularity, connection ownership, and field selection.
