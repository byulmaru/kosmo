## Context

Native Settings and pre-login recovery need one bounded `dev`/`prod` choice for API, Web, OIDC, Sentry and OTA.
The existing publisher stores signed manifests and immutable assets under
`releases/{project}/{platform}/{channel}/{runtimeVersion}/...`; the fixed Native URL must reach that tuple without
adding a delivery service.

## Goals / Non-Goals

**Goals:**

- Keep the Native selector and all selected environment consumers aligned.
- Rewrite the queryless project-qualified manifest request to the existing signed tuple.
- Apply a different channel only after compatible update verification/download and preserve fallback on failure.

**Non-Goals:**

- Web selector changes, a Worker/new public path, synthetic responses or asset proxying
- Publisher, static object layout, channel promotion, or recovery reissue changes
- Native code/module/SDK/permission delivery through OTA

## Implementation Guidance

### Current Constraints

- The client keeps `updates.url` at `https://expo-ota.byulmaru.co/releases/kosmo-native` and persists only the
  `expo-channel-name` request-header override; Expo supplies platform and runtime headers.
- The UI exposes only `dev` and `prod`, while publisher channels remain generic safe single segments.
- The Rule must preserve the project path, use all tuple dimensions, and leave missing targets as static-origin 404.
- Query-bearing requests remain outside this change's supported manifest contract because existing edge headers are
  not preserved there.

### Recommended Approach

1. Reuse the existing Settings composition and shared public configuration mapping for the Native selector.
2. Treat cancel and same-value selection as no-ops; for a different channel, check and download a compatible signed
   update before deleting Native login and reloading, then restore the old override and executable fallback on 404 or
   verification/download failure.
3. Use the deployed Cloudflare URL Rewrite Rule to rewrite only the URI path to the existing tuple and let R2,
   publisher, cache and response-header rules serve the stored artifacts.

### Allowed Alternatives

없음. The approved delivery mechanism is the Cloudflare URL Rewrite Rule over existing static R2.

### Known Traps

- A Worker, new endpoint or synthetic success would duplicate static delivery and hide missing releases.
- Declaring success before signed compatibility and download checks can strand the user on an unavailable channel.
- Treating channel as a Sentry release ID or narrowing publisher channels to `dev`/`prod` breaks existing contracts.

## Risks / Trade-offs

- Live provider state and Native Store/device behavior cannot be proven by local tests; retain separate provider and
  device evidence and keep the change unarchived until both are cross-checked.
- A missing tuple returns 404; the client must retain the original channel and executable fallback.

## Migration Plan

1. Ship the Native selector, shared mapping, persistent header and guarded transition.
2. Keep the deployed generic Rule and existing static delivery available; disable the new selector/Rule if rollout
   fails without adding a synthetic response.
3. Build/distribute new Android and iOS binaries for the native configuration change, then run device success/failure
   and offline checks and the final cross-slice review.

## Open Questions

없음.
