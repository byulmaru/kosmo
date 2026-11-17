# Relay Cache And Fetch Performance

Read this entire reference when choosing fetch policies, configuring store retention, filtering collections, or deciding whether to refetch.

Read the relevant Relay runtime and refetching documentation under `<llm-docs>/` before changing fetch policy, store, or refetch behavior.

## Fetch Policies

Use `store-or-network` by default: reuse cached records and request missing or stale data. Choose `store-and-network` to show cached data while refreshing, `network-only` only when freshness is critical, and `store-only` when data is guaranteed in the store or the flow is offline-first. Frequent `network-only` requests discard the benefit of normalization.

## Garbage Collection

Configure the Relay Store's `gcReleaseBufferSize` to retain recently used queries after unmount. The default is 10; a larger buffer can make back navigation instant for apps with many screens, while mobile or memory-constrained apps should keep it conservative.

## Filter On The Server

Pass filter and sort arguments to GraphQL fields. Do not fetch an entire collection and filter it in JavaScript: server-side filtering reduces payload, transfer, normalization, and client memory.

## Bound Collections

Paginate every collection with `@connection` and `usePaginationFragment`, starting with a viewport-sized page such as 10–20 items. Unbounded lists can transfer megabytes, stall normalization, and exhaust device memory. See [the pagination reference](../../relay-best-practices/references/pagination-client-state.md) and `<llm-docs>/guided-tour/list-data/pagination.mdx`.

## Avoid Unnecessary Refetches

Let mutation responses spread the relevant fragments so the normalized store updates consumers. Do not call `refetch()` or `fetchQuery()` when that response is sufficient; reserve manual refetch or `fetchKey` changes for side effects too broad to capture. `refetchQueries` and manual refetch each add a network round trip.
