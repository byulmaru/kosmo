## 1. Merge-safe preparation (PROD-268)

- [x] 1.1 Map the API/domain `contentWarning` property to the legacy SQL column `spoiler_text` while keeping the physical DB schema, `body_json` and `body_html` unchanged.
- [x] 1.2 Keep the physical Content Warning rename in the coordinated cutover so the preparation PR remains compatible with the parent API and DB.
- [x] 1.3 Add a shared Plain Text body schema that trims outer whitespace, rejects empty/over-500-character input, and preserves internal line breaks alongside the existing TipTap validator.
- [x] 1.4 Rename `PostContent.spoilerText` to `contentWarning`, regenerate `apps/api/schema.graphql`, and add an API schema unit test while keeping the TipTap scalar and create input.
- [x] 1.5 Render `PostContent.bodyText` directly in the app and remove the read-side TipTap extraction path while keeping the composer conversion path.
- [x] 1.6 Update app fixtures, adapter unit coverage and Storybook states for the direct Plain Text read path.
- [x] 1.7 Update canonical domain/OpenSpec/project memory for Content Warning naming and the direct Plain Text read path, then run OpenSpec strict validation.
- [x] 1.8 Run PROD-268 API/app unit, Relay, TypeScript, Storybook, format/lint and existing TipTap create Web E2E verification without a DB migration.

## 2. Atomic Plain Text cutover (PROD-267)

- [ ] 2.1 Rename `spoiler_text` to `content_warning`, remove `body_json` and `body_html` from the Drizzle schema, generate the coordinated destructive migration without modifying `body_text`, and add migration preservation coverage.
- [ ] 2.2 Replace TipTap document validation in `createPost` with the shared Plain Text schema and store `CreatePostInput.bodyText` directly while preserving transaction, ownership, revision, visibility, and payload behavior.
- [ ] 2.3 Remove the `TipTapDocument` scalar and `PostContent.bodyJson`, regenerate the API schema, and extend API contract unit coverage.
- [ ] 2.4 Submit and render Plain Text directly in the Relay app, remove manual document types/custom scalar mapping, and keep connection membership deferred to subscription.
- [ ] 2.5 Remove the core/app TipTap adapters, tests, exports, `@tiptap/*` dependencies, and lockfile entries with pnpm.
- [ ] 2.6 Update Web fixtures and E2E for Plain Text creation, multi-line preservation, and empty/over-500-character rejection.
- [ ] 2.7 Re-scope Linear PROD-259 to safe canonical Plain Text projection and update canonical OpenSpec/domain/project memory.
- [ ] 2.8 Verify no live TipTap/ProseMirror contract remains and run the full migration, API/app/core, Relay, TypeScript, Storybook, Web E2E, lint/format and OpenSpec strict suite.
