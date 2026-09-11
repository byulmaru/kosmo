# Relay Queries And Fragments

Read this entire reference when deciding where a query belongs, composing fragments, or choosing variables and preload timing.

Matching LLM docs: `guided-tour/rendering/fragments.mdx`, `guided-tour/rendering/queries.mdx`, `api-reference/hooks/use-fragment.mdx`, `api-reference/hooks/use-preloaded-query.mdx`, and `api-reference/hooks/load-query.mdx`.

## Queries Belong At Roots

Put queries at route entrypoints, never in reusable hooks. A query in a hook starts after its host renders and duplicates across callers. Accept a fragment key and call `useFragment` in the leaf instead.

Prefer `usePreloadedQuery` with `useQueryLoader` or `loadQuery`; start loading in an event handler, route transition, or app initialization before rendering the component. `useLazyLoadQuery` starts during render and may create a waterfall. Never put `loadQuery` in `useEffect`: effects run after paint, so that starts even later.

### Before Moving A Query, Ask Whether It Should Exist

Before moving a query, ask whether it should exist:

| Question                                       | Preferred action                        |
| ---------------------------------------------- | --------------------------------------- |
| An ancestor already fetches this GraphQL type? | Delete the query and use `useFragment`. |
| A component only fetches and passes data down? | Delete the loader wrapper.              |
| A query is inside a custom hook?               | Accept a fragment key instead.          |
| Two components fetch the same data?            | Fetch once in their common ancestor.    |
| Data is only for logging or analytics?         | Defer it or log on the server.          |
| Data is static for every user?                 | Inject it without a round trip.         |

## Walk The Ancestor Tree

Walk upward from a component before adding a query. Stop at route boundaries, feature gates, conditional renders, and user-triggered interactions. Continue through unconditional renders, layout or wrapper components, and context providers. If an ancestor already queries the type, pass the fragment key through as many layers as needed; that is the intended pattern.

## Variables And Conditional Data

Do not default an unavailable variable to `''`, `0`, or `null`; a bad query can return wrong data or errors. Render conditionally (`if (!id) return null`) or omit the field with `@include`/`@skip` until the real value exists.

## Fragment Data Flow

Every component that displays server data declares a fragment and receives its generated `$key` reference. The parent spreads the child fragment in its own query or fragment and passes that reference through. This preserves masking and lets each component own the fields it renders.

See `<llm-docs>/guided-tour/rendering/queries.mdx` and `<llm-docs>/guided-tour/rendering/fragments.mdx` for API details.
