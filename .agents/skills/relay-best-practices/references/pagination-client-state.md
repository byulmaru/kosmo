# Relay Pagination And Client State

Read this entire reference when implementing pagination or shared client-only state.

Matching LLM docs: `guided-tour/list-data/pagination.mdx`, `api-reference/hooks/use-pagination-fragment.mdx`, and `guides/relay-resolvers/introduction.mdx`.

## Pagination

Use the three-directive pattern together: `@argumentDefinitions` for cursor and count variables, `@refetchable` to generate the pagination query, and `@connection` for normalized store identity. Read the connection with `usePaginationFragment`. Do not write manual pagination queries or maintain edge and cursor concatenation in React state.

See `<llm-docs>/guided-tour/list-data/pagination.mdx` and `<llm-docs>/api-reference/hooks/use-pagination-fragment.mdx` for the complete API.

## Client State

When several components need shared client-only data, prefer Relay Resolvers to prop drilling or React context. Resolver fields get the same composition and caching model as server data; use `useClientQuery` for a query that reads only resolver fields.

See `<llm-docs>/guides/relay-resolvers/introduction.mdx` for resolver setup and limitations.
