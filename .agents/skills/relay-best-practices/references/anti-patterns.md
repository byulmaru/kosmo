# Relay Anti-Patterns

Read this entire reference when reviewing data flow, mutation callbacks, or component boundaries.

## Never Copy Relay Data Into React State

Relay's normalized store is the source of truth. Do not copy a `useFragment` value into `useState`, update that copy from a mutation `onCompleted`, or store a fragment `$key` in state. A response with a matching `id`, subscription, or refetch updates the store and fragment consumers automatically; a copied value becomes stale. A stashed key can also outlive the retained query and point at garbage-collected data.

## Maintain Fragment Co-Location

Do not select every child field in a parent query and pass raw objects or scalar subsets. The child owns a fragment, the parent spreads it, and the child receives its `$key`. This keeps data masking and ownership intact; `relay/unused-fields` is a useful signal that a parent is selecting data only for a child.

## Spread Fragments In Mutation Responses

Do not repeat a component's fields one by one in a mutation response. Spread the component fragment so response data and rendered data evolve together. This also gives Relay the Node identity and fields needed for normalized updates.
