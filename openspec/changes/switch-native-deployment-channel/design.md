## Context

Native Settings currently has a separate product contract from Web Settings. The new slice adds a Native-only
`dev`/`prod` channel selector in `정보` and a pre-login recovery entry point. The selected environment must move API,
Web, OIDC, Sentry, and Expo OTA together, while the Store default remains `prod`.

The existing OTA publisher writes signed multipart manifests and immutable assets under the static R2 tuple
`releases/{project}/{platform}/{channel}/{runtimeVersion}/...`. The generic server contract accepts the
project-qualified custom-domain path `/releases/{project}` with required request headers; Cloudflare should preserve
that project segment and map the headers to the existing tuple with a URL Rewrite Rule. The Native client uses its
fixed URL `https://expo-ota.byulmaru.co/releases/kosmo-native`. The static delivery and publisher remain separate from
this Native slice.

## Goals / Non-Goals

**Goals:**

- Provide a bounded Native `dev`/`prod` selector after login and before login recovery.
- Keep API, Web, OIDC, Sentry, and OTA channel selection aligned.
- Route the project-qualified manifest URL and required headers to the existing signed tuple manifest while preserving
  the project namespace.
- Apply the channel only after compatible update verification and download, then clear Native login and reload.
- Restore the original channel and executable fallback on 404 or any update failure.

**Non-Goals:**

- Web channel selection UI or Web Settings behavior
- A new Worker, public endpoint, `/updates` path, synthetic response, or asset proxy
- Changes to static asset bytes, publisher workflow, release tuple layout, channel promotion, or recovery reissue
- Native code/module/SDK/permission delivery through OTA
- Completion of live Cloudflare Rule or Native Store/device verification in this artifact-writing step

## Implementation Guidance

### Current Constraints

- `apps/app` must preserve the fixed `updates.url` and use the existing `expo-updates` persistent request-header
  behavior; the selected channel is read from the app's active `Updates.channel` after reload.
- Only `dev` and `prod` are product selector values. The static publisher's safe channel-segment contract remains
  broader and must not be narrowed by the UI.
- The rewrite target must include project, platform, channel, and runtimeVersion. RuntimeVersion alone cannot choose a
  project, and unsafe header values must not produce a path traversal or cross-namespace read.
- Existing manifest cache bypass and response-header transform rules match `/releases/*/manifest.json`, so the target
  must remain in that namespace. Assets continue to use their immutable direct URLs.
- A missing target is a static-origin 404. There is no custom empty or successful response to turn an unavailable
  update into a valid one.

### Recommended Approach

1. Keep the Native selector and pre-login recovery entry point in the existing Settings composition, exposing only
   `dev` and `prod` and preserving the current `정보` policy links and Web surfaces.
2. Resolve the selected value through the shared public configuration mapping so API, Web, OIDC, Sentry, and OTA
   use one environment. Let Expo provide the platform and runtime headers for the fixed manifest request; persist
   only the app's `expo-channel-name` override.
3. For a different selection, run Expo's compatible signed update check and download first. On success, clear the
   current Native login and reload. On cancel, same selection, 404, or any verification/download failure, restore the
   previous override and leave the original executable update in place.
4. Configure the Cloudflare URL Rewrite Rule for the project-qualified GET path `/releases/{project}` and required
   headers. Preserve the project path segment and rewrite only to the existing tuple manifest path, then let the R2 custom domain,
   existing edge rules, and publisher continue to serve their stored artifacts.

### Allowed Alternatives

없음. 확정된 scope에서는 Cloudflare URL Rewrite Rule과 기존 static R2 delivery를 사용한다.

### Known Traps

- Building a Worker or `/updates` endpoint duplicates the static delivery responsibility and changes the approved
  public contract.
- Rewriting to a path outside `/releases/*/manifest.json` bypasses the existing manifest edge rules.
- Declaring the channel switch successful before a compatible update is verified can strand the user on an
  unavailable channel; a temporary header may still be required while fetching that candidate update.
- Returning a synthetic success response for a missing manifest hides the update failure and bypasses fallback behavior.
- Expanding the selector to arbitrary publisher channel names or adding a Web selector changes the approved product scope.
- Treating channel as a Sentry release ID obscures whether a new OTA bundle has a different build release.

## Risks / Trade-offs

- [Cloudflare Rule is a live provider state rather than a local app test] → Keep provider configuration and live
  request matrix evidence in `PROD-334`; do not mark the delivery task complete from static source inspection alone.
- [A target channel may have no compatible release] → Preserve the static-origin 404 and restore the prior channel,
  login, and executable fallback without a custom response.
- [API/OIDC/OTA selection can drift] → Derive all Native consumers from the same `dev`/`prod` selection and verify
  their observed origins and headers together.
- [A successful OTA can contain new JavaScript with a different release metadata identity] → Keep channel as
  environment only and retain the existing per-bundle build release/source-map rules.

## Migration Plan

1. Land the Native selector, shared environment mapping, persistent request headers, and success/failure transition
   in the `PROD-956` implementation slice while leaving Web surfaces unchanged.
2. Configure the project-qualified Cloudflare Rewrite Rule for `/releases/{project}` in the `PROD-334` provider slice.
   Preserve existing `/releases/*` cache, response-header, asset, and publisher behavior.
3. Run focused app tests and validate the rule's valid, missing-header, missing-manifest, and direct-asset matrix.
4. Build and distribute the required Native binary, then perform channel success, 404/failure rollback, and offline
   fallback checks on Android and iOS. These live checks remain pending.
5. If the rule or Native transition fails, disable the new selector/rule and keep the Store `prod` default and
   existing static tuple delivery available. Do not introduce a synthetic response during rollback.

## Open Questions

없음.
