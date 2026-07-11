## Context

이 기록은 `migrate-frontend-to-expo-relay` proposal, capability delta spec, 기술 design과 현재 저장소 조사 결과를 반영한다. 목표는 기존 SvelteKit UI와 Kotlin/Swift WebView shell을 하나의 Expo/React Native Web/Relay 클라이언트로 교체하면서 web origin의 인증·GraphQL·federation·배포 계약을 보존하는 것이다.

## Decision Records

### Expo managed/CNG 프로젝트를 `apps/app`에 둔다

- Status: Accepted
- Context / Problem: 현재 `apps/app`의 수동 Gradle/Xcode WebView 프로젝트는 UI를 공유하지 못하고 workspace package도 아니다.
- Decision Outcome: `apps/app`을 Expo SDK 56 managed/CNG workspace package로 교체하고 Expo Router를 유일한 client route tree로 사용한다. package/bundle ID `moe.kos`와 scheme `kosmo`는 유지한다. SDK 57은 핵심 package가 workspace의 7일 `minimumReleaseAge`를 아직 충족하지 못해 채택하지 않는다.
- Alternatives Considered: 기존 native project에 bare React Native를 수동 통합하는 안은 Gradle/Xcode source를 계속 직접 소유하고 Expo upgrade 비용을 높여 제외했다. 별도 `apps/expo`를 병행하는 안은 중복 client를 남겨 제외했다.
- Consequences: 기존 `android`, `ios` source는 제거되고 필요할 때 `expo prebuild`가 생성한다. native-only 기능은 config plugin 또는 platform module 경계로 제한한다. SDK 57 전환은 package maturity window 이후 별도 upgrade로 수행한다.
- Confirmation / Follow-up: `expo config`, Android/iOS bundle 명령과 deep-link config로 식별자를 검증한다. 2026-07-11 기준 maturity policy를 만족하는 `expo@56.0.14`와 `expo-router@56.2.13`을 설치했다. 권장 patch `expo@56.0.15`와 `expo-router@56.2.14`는 아직 7일 age window 안이므로 dependency version check만 유예하고 나머지 Expo Doctor 항목을 검증했다. 해당 patch set이 정책에 들어오면 함께 upgrade하고 unfiltered Doctor를 다시 실행한다.

### `apps/web`은 Hono BFF와 Expo asset server로 유지한다

- Status: Accepted
- Context / Problem: SvelteKit은 UI 외에도 login, cookie, GraphQL proxy, Fedify, health와 Kubernetes web runtime을 소유한다.
- Decision Outcome: Svelte UI/framework는 제거하되 `apps/web` package는 Hono 기반 BFF로 남긴다. BFF는 server endpoint를 먼저 처리하고 그 외 GET을 `apps/app/dist` asset 또는 SPA fallback으로 제공한다.
- Alternatives Considered: 모든 endpoint를 `apps/api`로 옮기는 안은 public web origin/federation/쿠키 경계와 Helm routing을 함께 바꿔 제외했다. Expo API route에 넣는 안은 client build와 database/federation runtime dependency를 결합해 제외했다.
- Consequences: web workload와 origin은 유지되며 Expo native bundle은 BFF code를 포함하지 않는다. Docker는 app export와 BFF runtime을 모두 패키징한다.
- Confirmation / Follow-up: `/health`, `/`, `/graphql`, login callback, WebFinger와 ActivityPub smoke test를 유지한다.

### Expo Web은 단일 SPA output으로 시작한다

- Status: Accepted
- Context / Problem: 임의 handle/post ID route를 request-time render하려면 Expo server output과 Relay SSR hydration을 함께 설계해야 한다. 현재 OpenSpec에는 SEO 또는 server-rendered data 요구사항이 없다.
- Decision Outcome: `web.output: single`을 사용하고 BFF가 canonical client route에 `index.html`을 fallback한다.
- Alternatives Considered: Expo server output과 Relay SSR은 공개 HTML을 보존하지만 migration surface와 runtime 결합이 크게 늘어 이번 범위에서 제외했다. 모든 동적 route를 static params로 생성하는 안은 임의 profile/post에 적용할 수 없어 제외했다.
- Consequences: deep link와 browser navigation은 보존하지만 public page의 initial HTML에는 entity content가 없다.
- Confirmation / Follow-up: 검색 유입, social preview 또는 no-JS 공개 화면이 product requirement가 되면 server output + Relay SSR을 별도 change로 도입한다.

### API schema를 유지하고 React Relay client만 교체한다

- Status: Accepted
- Context / Problem: API는 이미 Node, global ID, node/nodes query, PageInfo, cursor connection을 제공한다.
- Decision Outcome: Pothos schema/resolver shape를 유지하고 Mearie document를 React Relay fragment/query/mutation으로 변환한다. followers/following은 `@refetchable`, `@connection`, `usePaginationFragment`를 사용한다.
- Alternatives Considered: Relay mutation field나 base64 ID로 API 전체를 재작성하는 안은 현재 Relay runtime에 필요하지 않아 제외했다. 범용 GraphQL client를 중간에 추가하는 안도 중복 cache를 만들어 제외했다.
- Consequences: `DateTime`과 `TipTapDocument` custom scalar mapping이 필요하고 모든 document는 compiler를 통과해야 한다.
- Confirmation / Follow-up: Relay compile과 TypeScript check를 CI/build 선행 단계로 둔다.

### Active profile별로 Relay environment를 재생성한다

- Status: Accepted
- Context / Problem: `homeTimeline`, `viewerState`, `viewerFollow`는 active profile에 따라 바뀌지만 field argument가 없어 record key만으로 actor context를 구분할 수 없다.
- Decision Outcome: `Session.selectedProfile.id`가 바뀌면 새 `Environment(Network, Store)`를 만들고 현재 route query를 새 environment에서 다시 실행한다.
- Alternatives Considered: 영향 field를 수동 나열해 invalidate하는 안은 누락 위험이 있고 Mearie 전용 invalidation을 그대로 복제한다. schema 모든 viewer field에 actor argument를 추가하는 안은 server contract를 불필요하게 바꿔 제외했다.
- Consequences: profile 전환 직후 현재 route가 다시 로드되며 이전 actor cache는 재사용하지 않는다. mutation payload의 `Session.selectedProfile`은 전환 UI를 즉시 갱신하는 데 계속 사용한다.
- Confirmation / Follow-up: profile switch E2E에서 home timeline과 viewer-relative action이 새 profile 기준으로 다시 요청되는지 확인한다.

### Web cookie와 native SecureStore session을 분리한다

- Status: Accepted
- Context / Problem: HttpOnly cookie jar를 공유하던 WebView와 달리 React Native fetch는 browser callback cookie를 사용할 수 없다.
- Decision Outcome: Web은 기존 `/login`과 `/login/callback` HttpOnly cookie를 유지한다. Native는 Expo AuthSession으로 PKCE code를 받고 `/login/native/session`에 code/verifier를 POST해 Kosmo token을 받은 뒤 validated web origin과 함께 SecureStore JSON envelope에 저장한다. 기존 Vault의 `PUBLIC_ORIGIN`, `PUBLIC_OIDC_ISSUER`, `PUBLIC_OIDC_CLIENT_ID`는 Expo config에서 대응 `EXPO_PUBLIC_*`로 mapping하고 명시적 Expo override를 우선한다. 두 client 모두 BFF `/graphql`을 사용한다.
- Alternatives Considered: token을 deep link query에 넣는 안은 노출 위험 때문에 제외했다. OIDC client secret을 app에 넣고 직접 교환하는 안도 제외했다. native cookie emulation은 platform별 cookie jar 결합을 다시 만들기 때문에 제외했다.
- Consequences: BFF가 native session exchange validation과 Bearer forwarding을 추가로 소유한다. 저장 token이 invalid하거나 envelope origin이 현재 configured origin과 다르면 client가 삭제하고 onboarding으로 이동한다. Native origin은 HTTPS를 기본으로 하고 loopback 외 HTTP는 명시적 development override가 있을 때만 허용한다.
- Confirmation / Follow-up: native exchange request, Bearer GraphQL contract, origin-bound storage와 unsafe origin 거부 test를 추가한다. `id_token` cryptographic validation은 별도 PROD-246 범위로 유지한다.

### 현재 TipTap subset은 pure TypeScript plain-text adapter로 옮긴다

- Status: Accepted
- Context / Problem: 기존 TipTap editor/renderer는 DOM에 의존해 native에서 실행할 수 있지만 현재 schema는 doc/paragraph/text만 사용한다.
- Decision Outcome: 공용 `TextInput`의 plain text를 TipTap JSON으로 변환하고 TipTap JSON을 공용 `Text` tree/plain text로 projection하는 최소 adapter를 사용한다.
- Alternatives Considered: native rich text editor dependency 추가는 현재 product 기능보다 크고, Web만 TipTap을 유지하는 안은 작성 UX/data code를 분기해 제외했다.
- Consequences: 현재 줄바꿈·500자·visibility·submit 계약은 유지한다. mark/media/mention이 schema에 추가되면 editor 선택을 다시 결정해야 한다.
- Confirmation / Follow-up: 변환 round-trip 단위 test와 compose E2E를 추가한다.

### Svelte/WebView를 병행하지 않고 screen slice별 commit 후 일괄 cutover한다

- Status: Accepted
- Context / Problem: 장기간 dual-client 운영은 같은 기능과 schema operation을 두 번 유지하게 만든다.
- Decision Outcome: 한 branch에서 foundation과 화면을 검증 가능한 commit으로 나누되 최종 tree에는 Expo UI만 남긴다.
- Alternatives Considered: production route별 strangler cutover는 rollback은 쉽지만 BFF routing, 두 UI dependency, 중복 test를 장기간 유지해야 해 제외했다.
- Consequences: branch diff는 크지만 main에는 단일 client만 들어간다. 각 commit은 foundation, vertical slice, cleanup 경계를 가져야 한다.
- Confirmation / Follow-up: cleanup 전 모든 canonical route를 Playwright로 검증한다.

### Relay generated artifact는 commit하지 않는다

- Status: Accepted
- Context / Problem: generated artifact는 schema/document에서 재현 가능하고 대규모 generated diff는 review signal을 낮춘다.
- Decision Outcome: `__generated__`를 ignore하고 prepare, lint/check, dev와 build script가 필요 전에 Relay compiler를 실행한다.
- Alternatives Considered: generated artifact commit은 clone 직후 type navigation이 쉽지만 schema/document와 artifact drift를 별도 관리해야 해 제외했다.
- Consequences: source install/build가 compiler 실행에 의존하며 generated type을 보려면 compile이 선행되어야 한다.
- Confirmation / Follow-up: clean checkout과 Docker build에서 compiler가 artifact를 생성하는지 검증한다.

### Svelte Storybook 상태 카탈로그를 React Native Web Storybook으로 이식한다

- Status: Accepted
- Context / Problem: 30개 story는 Svelte component와 Mearie mock에 종속되어 그대로 재사용할 수 없지만 loading/error/edge case와 accessibility 상태를 검토하는 기존 workflow를 제공한다.
- Decision Outcome: `@storybook/react-vite` + React Native Web alias 기반 catalog를 `apps/app`에 구성하고 공용 primitive와 주요 domain component story를 React/Relay mock으로 이식한다.
- Alternatives Considered: Storybook을 제거하고 E2E만 유지하는 안은 독립 component state를 빠르게 검토하는 회귀를 만들어 제외했다. Svelte Storybook 병행은 이중 component를 남겨 제외했다.
- Consequences: Storybook build dependency와 Relay fragment mock 경계가 필요하지만 기존 visual/a11y 검토 surface를 유지한다.
- Confirmation / Follow-up: Storybook static build와 a11y test를 CI 검증에 포함한다.

## Remaining Decisions

- Expo server output + Relay SSR 도입 시점: 검색/preview/no-JS 요구가 명시될 때 결정한다.
- rich text editor 확장: TipTap document schema가 plain text subset을 넘을 때 platform editor와 data contract를 결정한다.
- EAS/app store 배포: 계정, signing credential, channel 정책이 제공될 때 별도 운영 change에서 결정한다.

## Active OpenSpec Migration Audit (2026-07-11)

기존 active change의 checkbox는 해당 Svelte/Mearie 구현 당시의 완료 이력으로 보존한다. 아래 표가 Expo cutover 이후의 canonical disposition이며, backend/federation domain task 자체를 완료 처리한다는 뜻은 아니다.

| Active change                               | Legacy 상태                                                                                                                                   | Expo/Relay 이식                                                                                                                                                                                                                                     | Superseded 구현                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add-activitypub-actor-discovery`           | `packages/fedify` domain과 SvelteKit hook 연결까지 완료된 task 이력은 보존하고, discovery 응답·DB·GraphQL 검증의 미완료 task는 계속 유효하다. | Hono BFF의 `federation.fetch` 전달은 migration `2.5`, server test는 `2.7`, production smoke는 `7.3`에서 검증한다.                                                                                                                                   | `hooks.server.ts`, `@fedify/sveltekit`, SvelteKit route preservation 검증은 Hono `apps/web/src/server` 경계로 대체한다.                                                           |
| `add-activitypub-remote-profile-federation` | backend/DB/API/Fedify task는 아직 별도 active 범위다.                                                                                         | 저장 remote profile의 `origin`/`relativeHandle`, profile/list/search route 동작은 migration `5.5`~`5.7`의 Expo route와 Relay fragment에 반영한다.                                                                                                   | `apps/web` UI path와 Svelte component 검증은 `apps/app` route/component와 Relay compiler/E2E 검증으로 대체한다.                                                                   |
| `add-activitypub-remote-follow`             | protocol, DB projection, API task는 아직 별도 active 범위다.                                                                                  | remote follow action과 viewer-relative 상태는 migration `5.5`, 목록은 `5.6`, 검색 결과는 `5.7`의 공용 Relay fragment를 사용한다.                                                                                                                    | Svelte follow button/status와 web-only test path는 React Native 공용 `FollowButton`과 universal route test로 대체한다.                                                            |
| `add-protected-route-auth-splash`           | legacy change는 7/7 완료다.                                                                                                                   | migration `3.3`의 보호 route guard가 캐시 없는 cold validation splash, cached valid session의 splash 생략, `null` redirect 중 splash 유지, query error fail-open을 보존한다. splash는 inert overlay와 접근성 label을 갖고 `4.5`/`6.3`에서 검증한다. | `+layout.svelte`, `Splash.svelte`, Tailwind overlay class는 Expo layout/provider와 React Native `Splash`로 대체한다.                                                              |
| `add-shell-responsive-breakpoints`          | Svelte 구현 8/9와 경계 폭 수동 확인 1건의 이력을 보존한다.                                                                                    | migration `4.2`/`4.3`이 768px·1280px 단계, 아이콘 레일, full sidebar, right rail, drawer/bottom tab/compose entry를 이식하고 `6.3`/`6.5`에서 경계를 검증한다.                                                                                       | Tailwind `md`/`xl` class와 Svelte DOM dual branch는 `theme/tokens.ts`의 `compact`/`full`, `useWindowDimensions`, universal shell render branch로 대체한다.                        |
| `add-web-app-shell-sticky-rails`            | document scroll + sticky rail 방향의 legacy task 26/31 완료 이력과 남은 로그인-session smoke 범위는 보존한다.                                 | migration `4.2`/`4.3`에서 web document scroll, sticky rail, mobile safe area와 bottom overlap을 이식하고 `6.3`/`6.5`에서 route/focus/viewport smoke를 수행한다.                                                                                     | SvelteKit `noScroll`/`data-sveltekit-noscroll`, Svelte route wrapper와 WebView overscroll 가정은 Expo Router query navigation과 React Native Web/native platform 경계로 대체한다. |
| `connect-profile-follow-lists`              | 첫 페이지 데이터 연결 10/13 완료 이력은 보존한다.                                                                                             | migration `5.6`의 `ProfileConnectionList` Relay fragment가 followers/following route, edge 순서, empty/error/action policy를 이식한다.                                                                                                              | `.svelte` route/story와 `@kosmo/web check`는 Expo `.tsx`/React Native Web Storybook, Relay compiler와 `@kosmo/app check`로 대체한다.                                              |
| `connect-profile-follow-list-pagination`    | legacy pagination 12/13 완료 이력은 보존한다.                                                                                                 | migration `5.6`에서 `@refetchable`, `@connection`, `usePaginationFragment`로 load-more/loading/retry/last-page 동작을 이식한다.                                                                                                                     | Mearie route state의 수동 edge merge, cursor 누적 helper와 cache reset은 Relay connection Store가 대체한다.                                                                       |
| `fix-profile-follow-count-order`            | active directory는 이미 archive된 `2026-06-24-fix-profile-follow-count-order` 완료 change의 중복이므로 legacy behavior는 완료로 취급한다.     | migration `4.3`/`5.5`의 `SidebarNavigation`과 `ProfileHero`가 `팔로잉 → 팔로워` 및 `followingCount → followersCount` 매핑을 보존한다.                                                                                                               | 중복 active Svelte task와 `.svelte` path는 별도 구현하지 않고 Expo component 검증에 흡수한다.                                                                                     |

## Superseded Decisions

- Android `WebView`와 iOS `WKWebView`가 remote web app을 호스팅한다는 결정을 Expo native rendering이 대체한다.
- Mearie `cache-and-network`와 수동 connection edge merge 결정을 Relay environment와 `usePaginationFragment`가 대체한다.
- SvelteKit adapter-node가 web UI와 BFF를 함께 실행한다는 결정을 Expo SPA asset + Hono BFF 분리가 대체한다.
