# PROD-190 Fedify Actor Dispatcher Handoff Notes

Temporary working note for continuing this branch from another device. This file is intentionally committed for handoff now, but must be removed before opening the PR.

Updated: 2026-07-02 Asia/Seoul
Branch: prod-190
Base when created: origin/main

## User Constraints

- Work issue: PROD-190.
- Use existing OpenSpec change: add-activitypub-actor-discovery.
- Do not create a new OpenSpec Change in this PR.
- If a new OpenSpec Change becomes necessary, split that into a separate PR.
- Current checkpoint should be committed and pushed, but no Draft PR should be opened yet.

## Scope Boundary

In scope for PROD-190:

- Register Fedify actor dispatcher for `/ap/actor/{identifier}`.
- Identifier should be raw local `profile.id` UUID.
- Return a local ACTIVE profile as an ActivityPub `Person` document.
- Lazily create/reuse `ActivityPubActors` row.
- Lazily create/reuse RSA PKCS#1 v1.5 and Ed25519 `ActivityPubActorKeys` rows.
- Expose RSA key as `publicKey` and Ed25519 key as `assertionMethods`.
- Advertise actor-scoped inbox/outbox URI values but do not register functional endpoints.
- Unsupported inbox/outbox/followers/following/sharedInbox endpoints should remain 404.

Out of scope:

- New OpenSpec Change.
- WebFinger handle mapping (planned as PROD-191 / OpenSpec task 4.3).
- Remote profile materialization (PROD-234).
- Inbox delivery, outbox submission, outbox collection, followers/following collections, shared inbox.
- Remote actor fetch/cache/signature verification.

## Fedify 2.3.0 Research

Use from `@fedify/fedify`:

- `createFederation`
- `MemoryKvStore`
- `setActorDispatcher('/ap/actor/{identifier}', dispatcher)`
- `.setKeyPairsDispatcher(dispatcher)`
- `ctx.getActorUri(identifier)`
- `ctx.getActorKeyPairs(identifier)`
- `generateCryptoKeyPair('RSASSA-PKCS1-v1_5')`
- `generateCryptoKeyPair('Ed25519')`
- `exportJwk(key)`
- `importJwk(jwk, 'public' | 'private')`

Use from `@fedify/vocab`:

- `Person`
- Tests may instantiate `CryptographicKey` and `Multikey` for fixtures, but production actor code should not do that manually.

Important Fedify key behavior:

- Key-pairs dispatcher returns plain `CryptoKeyPair[]`.
- `ctx.getActorKeyPairs(identifier)` wraps those into `ActorKeyPair[]` with `keyId`, `cryptographicKey`, and `multikey`.
- Fedify assigns key IDs by order:
  - first key: `#main-key`
  - second key: `#key-2`
  - multikey IDs: `#multikey-1`, `#multikey-2`, etc.
- Return RSA first and Ed25519 second so RSA becomes `#main-key`.

Important URI behavior:

- Do not call `ctx.getInboxUri(identifier)` or `ctx.getOutboxUri(identifier)` in PROD-190 actor document construction.
- Fedify throws unless corresponding inbox/outbox routes are registered.
- PROD-190 should not register these routes.
- Use actor-scoped derived URI helpers instead:
  - inbox: `{actorUri}/inbox`
  - outbox: `{actorUri}/outbox`

## Dependency Changes Already Made

Changed `packages/fedify/package.json` with pnpm/package command flow:

- Added runtime dependency: `@fedify/vocab` `2.3.0`
- Added dev dependency: `vitest` `4.1.8`
- Added scripts:
  - `test`: `pnpm run test:unit -- --run`
  - `test:unit`: `vitest`

`pnpm-lock.yaml` is modified accordingly.

Before PR, verify syncpack expectations. Other workspace packages use `vitest` with caret ranges; if `pnpm lint:syncpack` complains, adjust using pnpm CLI, not manual dependency edits.

## Files Added/Changed So Far

Added:

- `packages/fedify/src/actor-uri.ts`
- `packages/fedify/src/actor-uri.test.ts`
- `packages/fedify/src/local-profile-actor.ts`
- `packages/fedify/src/local-profile-actor.test.ts`
- `packages/fedify/src/local-actor-keys.test.ts`
- `temp/prod-190-fedify-actor-notes.md`

Modified:

- `packages/fedify/package.json`
- `pnpm-lock.yaml`

## Implemented So Far

`actor-uri.ts`:

- Exports `buildActorScopedUri(actorUri, 'inbox' | 'outbox')`.
- Appends suffix under the actor URI path.
- Normalizes a trailing slash on actor URI.
- Prevents the `new URL('inbox', actorUri)` bug that would replace the UUID segment.

`local-profile-actor.ts`:

- Exports `LocalProfileActorProfile` and `createLocalProfilePerson(...)`.
- Builds a Fedify/vocab `Person` from local profile data and Fedify `ActorKeyPair[]`.
- Maps:
  - `id` -> actor URI
  - `preferredUsername` -> profile handle
  - `name` -> profile name
  - `summary` -> profile bio
  - `url` -> local profile URL
  - `published` -> profile createdAt
  - `inbox` / `outbox` -> derived actor-scoped URIs
  - RSA `cryptographicKey` -> `publicKey`
  - Ed25519 `multikey` -> `assertionMethods`
- Throws if no RSA key pair is present.

## Test Status At Checkpoint

Passing focused tests:

```powershell
pnpm --filter @kosmo/fedify test -- packages/fedify/src/actor-uri.test.ts packages/fedify/src/local-profile-actor.test.ts
```

Result observed:

- 2 test files passed
- 4 tests passed

Intentional RED test added for next implementation step:

```powershell
pnpm --filter @kosmo/fedify test -- packages/fedify/src/local-actor-keys.test.ts
```

Current failure observed:

- `Cannot find module './local-actor-keys' imported from .../local-actor-keys.test.ts`
- This is expected because `src/local-actor-keys.ts` has not been implemented yet.
- Vitest output also reported the already implemented 2 test files / 4 tests as passing.

No full workspace verification has been run after this checkpoint.

## Next Implementation Steps

1. Implement `packages/fedify/src/local-actor-keys.ts` to satisfy `local-actor-keys.test.ts`.

   Suggested exported surface already expected by test:
   - `ensureLocalActorKeyPairs(...)`
   - `LocalActorStore`
   - `LocalProfileActorProfile`
   - `StoredLocalActorRow`
   - `StoredLocalActorKey`
   - `CreateLocalActorRowInput`
   - `CreateLocalActorKeyInput`

   Expected behavior:
   - Look up ACTIVE local profile by `{ localInstanceId, profileId }`.
   - Return `null` without creating rows if profile does not exist or is not local/active.
   - Find or create actor row for `{ profileId, uri }`.
   - Ensure exactly one RSA key row and one Ed25519 key row for actor.
   - Generate missing keys with Fedify `generateCryptoKeyPair`.
   - Export generated keys with `exportJwk` and persist both public/private JWK.
   - Re-import stored keys with `importJwk` and return `CryptoKeyPair[]` in RSA, Ed25519 order.

2. Add a Drizzle-backed store implementation.

   Use existing tables/enums:
   - `ActivityPubActors`
   - `ActivityPubActorKeys`
   - `Profiles`
   - `Instances`
   - `ActivityPubActorType.PERSON`
   - `ActivityPubActorKeyKind.RSA_PKCS1_V1_5`
   - `ActivityPubActorKeyKind.ED25519`
   - `ProfileState.ACTIVE`

   Use existing helpers:
   - `db`
   - `first`
   - `firstOrThrow`
   - `isUniqueViolation`
   - `resolveConfiguredLocalInstance()`

   Pattern:
   - Keep profile lookup scoped to the configured local instance ID.
   - Keep inserts idempotent. If a unique violation races, re-select the existing row.
   - Prefer a transaction around actor/key materialization if practical.

3. Wire `packages/fedify/src/federation.ts`.

   Current file only creates a blank federation. It should become something like:
   - `createKosmoFederation(options?)`
   - `export const federation = createKosmoFederation()`
   - Register `setActorDispatcher('/ap/actor/{identifier}', async (ctx, identifier) => ...)`
   - Register `.setKeyPairsDispatcher(async (ctx, identifier) => ...)`

   Dispatcher flow:
   - `const localInstance = await resolveConfiguredLocalInstance()`
   - `const actorUri = ctx.getActorUri(identifier)`
   - Ensure actor/key rows and get key pairs.
   - If result is null, return null so Fedify produces 404.
   - `const keyPairs = await ctx.getActorKeyPairs(identifier)` in actor dispatcher, not direct store result, so Fedify adds `cryptographicKey`/`multikey` wrappers.
   - Build `Person` with `createLocalProfilePerson`.
   - Derive inbox/outbox via `buildActorScopedUri(actorUri, ...)`.
   - Derive profile URL from configured canonical origin and handle, likely `new URL('/@' + handle, localInstance.canonicalOrigin)`.

4. Add/adjust tests for federation dispatcher behavior if feasible.

   Useful checks:
   - Existing local profile returns `Person` with canonical actor ID.
   - Missing/non-local/non-active profile returns 404/null.
   - `/ap/actor/{id}/inbox` and `/outbox` remain unsupported if practical to exercise through Fedify fetch/hook.

5. Run verification.

   Minimum commands:

   ```powershell
   pnpm --filter @kosmo/fedify test
   pnpm --filter @kosmo/fedify lint:tsc
   pnpm --filter @kosmo/web check
   pnpm exec openspec validate add-activitypub-actor-discovery --strict
   ```

   Also run syncpack/lint if dependency format changes trigger workspace checks.

6. Update OpenSpec tasks only after implementation is actually complete.

   Likely task candidates after implementation:
   - 4.4 actor dispatcher
   - 4.5 Person document
   - 4.7 lazy actor/key creation
   - 4.8 actor-scoped inbox/outbox advertisement with unsupported endpoints remaining 404
   - 5.2 / 5.3 depending on integration coverage

## PR Hygiene Before Opening PR

- Remove this `temp/prod-190-fedify-actor-notes.md` file before opening the PR.
- Keep WebFinger out unless the user explicitly expands scope.
- Do not create a new OpenSpec Change in this branch.
- Public PR comments, issue comments, Ready conversion, merge, or thread resolution require explicit user confirmation.
- Draft PR creation is allowed later by workflow, but the user explicitly asked this checkpoint to stop after commit/push.
