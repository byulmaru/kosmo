## Context

현재 Kosmo 프론트엔드는 `apps/web`의 SvelteKit UI/BFF와 `apps/app/android`, `apps/app/ios`의 WebView shell로 분리되어 있다. SvelteKit은 화면뿐 아니라 OIDC PKCE 시작·callback, HttpOnly cookie에서 Bearer token으로 변환하는 GraphQL proxy, health endpoint, Fedify adapter와 Node runtime 배포도 소유한다. 따라서 UI를 Expo static output으로 단순 교체하면 로그인, API 인증, federation, Kubernetes probe가 함께 사라진다.

API는 Pothos Relay plugin, loadable `Node`, `Query.node/nodes`, opaque global ID, cursor connection과 mutation payload를 이미 제공한다. 서버 schema를 다시 설계하지 않고 React Relay compiler/runtime로 client data layer를 교체할 수 있다. 다만 `homeTimeline`, `Profile.viewerState`, `viewerFollow`는 server session의 active profile에 따라 값이 바뀌면서 GraphQL argument가 없으므로 profile 전환 때 Relay actor cache 경계를 명시적으로 갱신해야 한다.

`apps/app`은 새 workspace package가 되고 저장소의 7일 dependency maturity 정책을 충족하는 Expo SDK 56, Expo Router, React Native Web을 사용한다. `apps/web`은 UI framework를 제거하고 기존 web-origin 책임과 Expo web asset 제공만 담당하는 Hono 기반 BFF가 된다. API와 database domain 구현은 유지한다.

### Target architecture

1. `apps/app`
   - Expo managed/CNG project로 Android package와 iOS bundle identifier `moe.kos`, scheme `kosmo`를 보존한다.
   - Expo Router가 기존 canonical route를 공용 route tree로 제공한다.
   - `src/components`, `src/features`의 React Native component가 Android/iOS/Web UI를 공유한다.
   - Relay compiler는 `apps/api/schema.graphql`과 colocated operation을 compile한다.
   - Relay network는 Web에서 same-origin cookie request, native에서 validated HTTPS origin에 귀속된 SecureStore Bearer request를 사용한다. 기존 Vault `PUBLIC_*` 공개 설정은 Expo config에서 `EXPO_PUBLIC_*`로 명시적 mapping한다.
   - TipTap의 현재 doc/paragraph/text subset은 native-safe plain-text projection과 JSON 변환으로 표시·작성한다.

2. `apps/web`
   - `/health`, `/login`, `/login/callback`, `/login/native/session`, `/graphql`을 제공한다.
   - 모든 request를 기존 `federation.fetch`에 먼저 전달하고, Fedify의 공식 미처리 callback에서만 Hono route와 SPA fallback을 실행한다.
   - 나머지 browser HTML GET request에는 `apps/app/dist` asset을 제공하고 알려지지 않은 client route는 `index.html`로 fallback한다. federation 표현의 미존재 resource는 404를 유지한다.
   - Expo 개발 서버는 고정 ActivityPub pathname 목록 대신 federation `Accept`/`Content-Type`을 기준으로 임의 경로를 BFF에 전달한다.
   - browser login은 기존 HttpOnly cookie를 유지한다. native login은 code/verifier를 server에서 교환하고 Kosmo session token을 JSON으로 반환한다.
   - 두 code exchange는 OIDC issuer discovery를 한 번 cache하고 표준 PKCE/token request 및 JWKS 기반 ID token signature·issuer·audience·time claims 검증을 거친다.

3. `apps/api`
   - GraphQL schema/resolver를 유지한다.
   - native와 web 모두 BFF가 전달한 Bearer session으로 같은 context derivation을 사용한다.
   - Relay 호환을 이유로 UUID ID를 재인코딩하거나 mutation shape를 일괄 변경하지 않는다.

4. Build and deployment
   - Relay compile과 Expo web export 뒤 생성된 `apps/app/dist`를 Docker web runtime에 복사한다.
   - web workload는 `apps/web` BFF를 시작하고 API workload는 기존 entrypoint를 유지한다.
   - Playwright는 BFF, API, mock OIDC를 함께 실행해 기존 canonical URL과 cookie login을 검증한다.

## Goals / Non-Goals

**Goals:**

- Android/iOS/Web에서 같은 Expo Router 화면과 React Native component를 사용한다.
- 현재 공개·보호 route, responsive shell, profile switch, timeline, compose, search, follow list/detail 동작을 보존한다.
- Mearie를 Relay compiler/runtime, fragment colocation, connection pagination으로 교체한다.
- browser cookie 인증과 native secure Bearer 인증을 한 BFF/API session 모델로 연결한다.
- 기존 federation, health, Docker/Helm web workload 계약을 유지한다.
- Svelte, Mearie, WebView native source와 이에만 필요한 build/test dependency를 제거하고 component 상태 카탈로그는 React Native Web Storybook으로 보존한다.

**Non-Goals:**

- GraphQL schema나 domain resolver의 전면 재설계.
- Expo web request-time SSR, public profile SEO metadata와 link preview 최적화.
- EAS 계정·credential 생성 또는 app store 배포.
- 알림·메뉴 placeholder에 새로운 product 기능 추가.
- TipTap의 현재 schema에 없는 rich mark, media, mention 기능 추가.
- 별도 보안 backlog인 `PostContent` direct Node visibility(PROD-247)를 이 migration branch에서 해결하는 것.

## Risks / Trade-offs

- [공개 동적 route가 SPA가 되어 request-time HTML content가 줄어든다] → BFF가 모든 canonical deep link에 `index.html`을 반환해 사용자 navigation은 보존하고, 검색 유입 또는 link preview가 product 요구가 되는 시점에 Expo server output과 Relay SSR을 별도 변경으로 도입한다.
- [native session token은 Web HttpOnly cookie와 달리 application code가 사용한다] → OIDC client secret은 BFF에만 두고, token은 HTTPS 응답으로 한 번 전달해 validated web origin과 함께 SecureStore에 저장하며 log/query string/deep link에 넣지 않는다. 환경 origin이 바뀌면 이전 token을 삭제하고 다시 로그인한다.
- [active profile 전환 후 viewer-relative Relay record가 stale할 수 있다] → `Session.selectedProfile.id`가 바뀔 때 Relay environment를 재생성해 actor-scoped data를 일괄 폐기하고 현재 route query를 network에서 다시 실행한다.
- [Expo/RN Web accessibility DOM이 기존 Svelte semantic HTML과 달라진다] → 공용 primitive에 explicit role/label/state를 두고 기존 Playwright role 기반 검증을 유지한다.
- [TipTap DOM editor는 native에서 실행되지 않는다] → 현재 허용된 doc/paragraph/text subset만 pure TypeScript로 변환하고 `TextInput`을 사용한다. schema가 확장될 때 platform editor를 별도 평가한다.
- [대규모 일괄 전환 중 rollback 지점이 부족할 수 있다] → OpenSpec/BFF, Expo foundation, screen slices, deployment cleanup을 각각 검증 가능한 commit으로 남긴다.
- [pnpm minimum release age와 Expo native package가 install을 막을 수 있다] → Expo SDK 권장 version을 명시적으로 추가하고 lockfile 생성 시 trust policy를 유지하며 필요한 예외만 version-pinned로 기록한다.
- [Relay generated artifact가 schema와 drift할 수 있다] → `lint:relay`와 TypeScript build 전에 compiler check를 실행하고 CI에서 generated diff 또는 compiler validation을 확인한다.

## Migration Plan

1. OpenSpec과 관련 design/memory를 새 architecture와 Relay 규칙으로 정렬한다.
2. `apps/web`의 auth/session 생성 로직을 framework-neutral module로 옮기고 Hono BFF에서 login, callback, native session, GraphQL proxy, health, federation을 검증한다.
3. 기존 manual `apps/app/android`, `apps/app/ios`를 Expo managed project로 교체하고 route skeleton, theme/font, Relay compiler/environment, auth storage를 구축한다.
4. 온보딩과 app shell을 먼저 옮긴 뒤 home/compose, profile/follow/post, search, placeholder 화면 순서로 vertical slice를 이식한다.
5. follow pagination은 `usePaginationFragment`, profile switch는 actor-scoped Relay environment reset, mutation은 response normalization과 필요한 connection updater로 옮긴다.
6. 기존 component state story를 React Native Web Storybook으로 이식하고 build/a11y 검증을 구성한다.
7. Playwright fixture/config를 새 BFF/Expo build에 맞추고 Relay compile, TypeScript, Expo export, Web E2E, Expo prebuild 및 Android/iOS build 검증을 실행한다.
8. Svelte/Mearie/manual native build source와 의존성을 제거하고 Docker, entrypoint, CI artifact path, 문서를 갱신한다.
9. production image를 build해 `/health`, `/`, `/graphql`, login callback, federation route를 smoke test한다.

Rollback은 commit 단위로 수행한다. BFF 계약이 실패하면 Expo UI commit 이전의 SvelteKit runtime으로 되돌릴 수 있고, screen migration 중 실패하면 foundation commit에서 원인을 분리한다. 최종 cutover commit 전에는 기존 web origin/API/database schema를 변경하지 않는다.

## Open Questions

현재 구현을 막는 미결정 사항은 없다. request-time SSR/SEO, rich text editor 확장, app store/EAS 배포는 위 Non-Goals와 decisions artifact에 수용 조건을 기록한다.
