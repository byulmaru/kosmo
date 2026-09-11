---
name: relay-performance
description: >-
  Performance best practices for Relay applications. Use when optimizing data
  fetching, reducing re-renders, configuring caching, or improving time to first
  meaningful paint. Covers query placement, @defer, pagination, fetch policies,
  garbage collection, fragment granularity, and server-side filtering. Companion
  to the relay-best-practices skill which covers correctness and architecture.
---

# Relay Performance Best Practices

Use this skill for Relay data-fetching, rendering, caching, and re-render
performance. For correctness, naming, and architecture, also use the companion
[`relay-best-practices`](../relay-best-practices/SKILL.md) skill.

When this skill applies, identify the relevant topic reference below and read
each selected reference in full before changing code. Read the matching page
from `<llm-docs>/` as well; it is available in
`node_modules/relay-runtime/llm-docs/` after v20.1.1.

## Reference routing

- [Query and rendering](references/query-rendering.md): root query count, preload timing, and `@defer`.
- [Cache and fetch](references/cache-fetch.md): fetch policies, garbage collection, server filtering, bounded collections, and refetches.
- [Fragments and connections](references/fragments-connections.md): fragment granularity, connection ownership, and field selection.
