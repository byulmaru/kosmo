# Relay Query And Rendering Performance

Read this entire reference when optimizing screen loading, render timing, or deferred content.

Matching LLM docs: `guided-tour/rendering/queries.mdx`, `api-reference/hooks/load-query.mdx`, and the relevant `@defer` guidance.

## One Query Per Screen

Keep each screen or route to one, or very few, root queries. Relay coalesces the needs of its fragments into one request; separate root queries add redundant headers, connections, parsing, and normalization work. Compose header, content, and sidebar fragments under the route query.

## Preload Before Rendering

Start the initial `loadQuery(environment, Query, variables)` before `createRoot().render()` when the platform lifecycle allows it. Provide the environment through `RelayEnvironmentProvider`, pass the query reference to the screen component, and read it there with `usePreloadedQuery`; the network overlaps React initialization and reduces time to first meaningful paint. The correctness skill covers route and hook placement decisions.

## Defer Non-Critical Content

Use `@defer` for below-the-fold or secondary fragments so critical UI can render from a smaller initial response. Render deferred fragments inside their own `Suspense` fallbacks. Good candidates include sidebars, tabs or accordions not visible initially, and heavy item details in paginated lists; keep primary content in the initial response.
