# Relay Architecture And Compiler

Read this reference when changing Relay architecture, compiler setup, generated artifacts, lint configuration, operation names, or generated types.

Matching LLM docs: `principles-and-architecture/thinking-in-relay.mdx`, `getting-started/compiler.mdx`, `getting-started/compiler-config.mdx`, and `getting-started/lint-rules.mdx`.

## Core Philosophy

- **Co-location:** a component declares the server data it needs in a GraphQL fragment beside its rendering code.
- **Data masking:** a component reads only fields selected by its own fragment; parents and children stay decoupled.
- **Composition:** child fragments spread into parent fragments and route queries, mirroring the component tree; Relay compiles the tree into one request per query.
- **Render-as-you-fetch:** begin loading before the component that needs the data renders, avoiding sequential waterfalls.
- **Normalized store:** Relay keeps an ID-keyed normalized store. A mutation response with an existing `id` updates every component reading that record.

## Compiler Workflow

Relay's ahead-of-time compiler reads `graphql` tags and generates runtime artifacts plus TypeScript/Flow types. It searches, in order, for `relay.config.{json,js,mjs,ts}` at the project root and a `"relay"` key in `package.json`; see `<llm-docs>/getting-started/compiler-config.mdx` for the schema or `npx relay-compiler config-json-schema` for JSON Schema output.

Run `npx relay-compiler` or the repository's Relay script after changing a `graphql` template or Relay Resolver docblock. Watch mode does not terminate in non-interactive contexts. Without an explicit `artifactDirectory`, Relay may use adjacent `__generated__/` directories; configure one artifact directory and align bundler module resolution with it so fragment references keep their generated types. Generated artifacts are never hand-edited; missing generated types usually mean the compiler is out of date.

## Lint Rules

Use the Relay ESLint plugin. `relay/unused-fields` catches fields selected but never read and prevents append-only fragments. `relay/no-future-added-value` prevents explicitly handling Relay's `"%future added value"` enum placeholder. Read `<llm-docs>/getting-started/lint-rules.mdx` for setup and the complete rule set.

## Naming And Generated Artifacts

Relay operation names match the module filename (all extensions removed):

| Element            | Convention                | Example              |
| ------------------ | ------------------------- | -------------------- |
| Fragment           | `ComponentName_propName`  | `UserCard_user`      |
| Query              | `ComponentNameQuery`      | `HomePageQuery`      |
| Mutation           | `ComponentNameMutation`   | `LikeButtonMutation` |
| Generated artifact | `__generated__/*.graphql` | Never edit           |

When extracting a component, rename only operations defined in the moved file. Fragment spreads owned by other modules keep their names. A renamed operation also changes generated types such as `UserCard_user$key`; update downstream imports. After formatter or lint fixes, verify `commit({ variables: { ... } })` keys against the generated `Mutation$variables` type, especially `data` versus `input`.
