# Relay Mutations And Errors

Read this entire reference when changing mutation responses, optimistic updates, invalidation, nullability, or real-time data.

Matching LLM docs: `guided-tour/updating-data/graphql-mutations.mdx`, `guided-tour/refetching/refetching-queries-with-different-data.mdx`, `api-reference/hooks/use-mutation.mdx`, `guides/throw-on-field-error-directive.mdx`, `guides/catch-directive.mdx`, `guides/semantic-nullability.mdx`, and `getting-started/compiler-config.mdx`.

## Mutation Responses

Spread the consuming component's fragment into the mutation response. Selecting the same fields individually in a mutation and fragment makes them drift. A response containing the affected Node's existing `id` and the fields the fragment reads lets Relay update its normalized store automatically.

Use `optimisticUpdater` when an optimistic value depends on current store state, such as incrementing a like count. Overlapping `optimisticResponse` values can both read the same old value and overwrite one another.

Avoid `refetch()` or `fetchQuery()` after a mutation when the response fragment is sufficient. Reserve a manual refetch for side effects too broad for the payload; prefer targeted `invalidateRecord()` in that case, or `invalidateStore()` for a genuinely global invalidation.

## Invalidation And Staleness

Pair invalidation with `useSubscribeToInvalidationState` where mounted components should refetch stale data. Relay cached data is fresh indefinitely by default, so choose an explicit policy when freshness matters: configure `queryCacheExpirationTime` for time-based staleness or invalidate affected records after wide-effect mutations.

## Field Errors And Nullability

For field errors, the preferred new-code pattern is `@throwOnFieldError` on a query or fragment, caught by a React error boundary. It also enables non-null types for `@semanticNonNull` fields. Use `@catch` when a field needs local handling, receiving an `{ ok: true, value } | { ok: false, errors }` result. `@required` can declare a specific non-null field, but is not the preferred general pattern. Ensure error boundaries are actually configured before relying on thrown field errors.

Read `<llm-docs>/guides/throw-on-field-error-directive.mdx`, `<llm-docs>/guides/catch-directive.mdx`, and `<llm-docs>/guides/semantic-nullability.mdx` for exact directive behavior.

## Store Updates And Real-Time Data

Use `@updatable` queries or fragments for type-safe store manipulation instead of string-based `store.get(id).setValue(...)`. Prefer GraphQL Subscriptions for data that must stay current; polling with `setInterval` and `fetchQuery`, or a manual refresh button, does not integrate as directly with the normalized store.

See [Architecture And Compiler](architecture-compiler.md#compiler-workflow) for the required `artifactDirectory`, generated artifact layout, and bundler module resolution.
