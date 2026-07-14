## 1. Contract and shared document boundary (PROD-341)

- [x] 1.1 Update canonical Post domain documentation and project memory from stored Plain Text to versioned canonical document plus derived Plain Text.
- [x] 1.2 Synchronize the active `add-activitypub-remote-post-ingestion` proposal, design, specs and tasks from stale TipTap/`bodyJson` storage to the PROD-341 versioned document contract without implementing PROD-259 or PROD-261.
- [x] 1.3 Add `prosemirror-model` to the server-owning core package with pnpm and expose separate native-safe `@kosmo/core/post-content` and server-only `@kosmo/core/post-content/server` subpaths.
- [x] 1.4 Define V1 JSON types, version registry constants and runtime-independent client type guard for doc/paragraph/text/hard_break/link.
- [x] 1.5 Implement the actual ProseMirror V1 Schema, `nodeFromJSON()`/`check()`/`toJSON()` validation, deterministic canonicalization, safe URL normalization, Plain Text conversion/projection and revision equality.
- [x] 1.6 Add core unit fixtures for valid/invalid schema expressions, attrs, unsafe links, line endings, empty paragraphs, adjacent text, mark dedupe/order, Plain Text round trip and equality.

## 2. Destructive non-production database migration (PROD-341)

- [x] 2.1 Replace Drizzle `PostContents.bodyText` with non-null `bodySchemaVersion` and typed jsonb `bodyDocument` columns.
- [x] 2.2 Generate a forward migration that deletes all existing Post/PostContent rows in FK-safe order, drops `body_text` and adds the new required columns without implicit defaults.
- [x] 2.3 Replace the Plain Text preservation migration test with destructive migration coverage for row deletion, column shape, constraints and insertion of a valid V1 document.

## 3. GraphQL document contract (PROD-341)

- [x] 3.1 Add an output-only `PostContentDocument` scalar and `PostContentBody` object exposing schema version and canonical document JSON.
- [x] 3.2 Resolve `PostContent.bodyText` from the server Plain Text projection instead of a stored DB field while preserving Content Warning and visibility access boundaries.
- [x] 3.3 Convert `CreatePostInput.bodyText` through the common V1 boundary and store version/document in the existing Post/PostContent transaction.
- [x] 3.4 Regenerate the GraphQL schema and extend schema, mutation, integration and visibility tests for document output, derived Plain Text, multi-line input and validation.

## 4. Limited React Native/Web renderer (PROD-341)

- [x] 4.1 Configure Relay to import the native-safe V1 document scalar type and regenerate artifacts without committing generated output.
- [x] 4.2 Replace Plain Text-only `PostBody` rendering with a V1 paragraph/text/hard-break/safe-link renderer and derived `bodyText` fallback for unsupported data.
- [x] 4.3 Update app fixtures, unit tests and Storybook states for multiple paragraphs, hard breaks, links, unsafe/unsupported fallback and accessibility metadata.
- [x] 4.4 Verify the app import graph and Expo Web export do not include `prosemirror-model`, TipTap, ProseMirror editor/view or WebView editor runtime.

## 5. Validation and publication (PROD-341)

- [x] 5.1 Run focused core, DB migration, API unit/integration, app unit/Storybook and Web E2E tests at the affected boundaries.
- [x] 5.2 Run Relay, API/app/core typecheck, lint/format, migration validation and `openspec validate version-post-content-document --strict` plus affected active-change validation.
- [x] 5.3 Review the diff for PROD-341 scope, commit without agent co-author trailer, push `prod-341`, open a Korean PR and mark it Ready for review after required checks pass.
