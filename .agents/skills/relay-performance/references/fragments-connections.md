# Relay Fragment And Connection Performance

Read this entire reference when changing fragment granularity, list components, or field selection.

Matching LLM docs: `guided-tour/rendering/fragments.mdx`, `guided-tour/list-data/pagination.mdx`, and `api-reference/hooks/use-pagination-fragment.mdx`.

## Keep Fragments Granular

Split a large fragment into component-scoped fragments so only components whose selected data changed need to re-render. A monolithic fragment shared by many children causes all of them to re-render when any field changes.

## One Connection Per Component

Use a single `usePaginationFragment` connection per component. Multiple connections tangle cursor tracking, loading state, and `hasNext`; split each connection into its own component.

## Fetch Only What You Need

Each fragment should select only fields the component renders. Do not add fields “just in case”; unused fields increase payload and parsing cost, and `relay/unused-fields` catches many such additions. If a child needs another field, add it to the child's fragment and spread that fragment in the parent.
