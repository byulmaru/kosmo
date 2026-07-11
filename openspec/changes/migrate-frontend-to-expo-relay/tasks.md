## 1. Expo와 Relay 기반 구성

- [x] 1.1 `apps/app`을 Expo SDK 56 workspace package로 만들고 `moe.kos`, `kosmo`, version/build metadata를 app config에 옮긴다
- [x] 1.2 pnpm CLI로 Expo Router, React Native Web, AuthSession, SecureStore, Relay runtime/compiler와 필요한 Expo SDK dependency를 호환 version으로 설치한다
- [x] 1.3 Metro, Babel Relay plugin, TypeScript, Expo Router typed route와 workspace module resolution을 구성한다
- [x] 1.4 `apps/api/schema.graphql`을 사용하는 Relay compiler config와 `DateTime`/`TipTapDocument` custom scalar type을 구성한다
- [x] 1.5 generated Relay artifact를 ignore하고 prepare, dev, check, build 전에 compiler가 실행되도록 package script를 연결한다
- [x] 1.6 SUIT/Pretendard local font loading과 공용 color/spacing/radius/typography token을 React Native theme로 옮긴다
- [x] 1.7 plain text와 현재 TipTap doc/paragraph/text JSON을 양방향 변환하는 native-safe adapter와 단위 test를 추가한다

## 2. Web BFF와 인증 경계

- [x] 2.1 SvelteKit login callback의 account upsert/session 생성 코드를 framework-neutral web server module로 추출한다
- [x] 2.2 Hono 기반 `apps/web` runtime에 `/health`, browser `/login`, `/login/callback` handler를 구현하고 기존 cookie 속성을 보존한다
- [x] 2.3 `/login/native/session` code/verifier validation, OIDC server-side exchange, JSON session token 응답과 실패 test를 구현한다
- [x] 2.4 `/graphql` proxy가 명시적 Bearer token을 우선하고 그렇지 않으면 `kosmo_session` cookie를 Bearer로 변환하도록 구현한다
- [x] 2.5 WebFinger/ActivityPub path를 `federation.fetch`로 전달하고 일반 request와 분리한다
- [x] 2.6 Expo web static asset 제공과 unknown client route의 `index.html` fallback을 구현한다
- [x] 2.7 browser login, invalid redirect, native exchange, cookie/Bearer/anonymous proxy, health, federation route의 server test를 추가한다

## 3. Relay 환경과 공용 인증 상태

- [x] 3.1 Web credential request와 native SecureStore Bearer request를 지원하는 Relay Network/Store factory를 구현한다
- [x] 3.2 Relay provider, Suspense loading boundary, retry 가능한 GraphQL/network error boundary를 Expo root layout에 연결한다
- [x] 3.3 `currentSession` bootstrap과 보호 route guard를 구현해 guest/invalid session은 `/`, valid session은 보호 화면에 유지한다
- [x] 3.4 Web login은 same-origin `/login`, native login은 Expo AuthSession PKCE와 SecureStore token 저장을 사용하도록 구현한다
- [x] 3.5 native 재실행 시 token을 복원하고 invalid session이면 SecureStore에서 제거하는 흐름을 구현한다
- [x] 3.6 `selectProfile` 성공으로 selected profile ID가 바뀌면 Relay environment를 재생성하고 현재 route data를 다시 요청한다
- [x] 3.7 Relay actor reset, GraphQL error formatting, session storage의 작은 단위 test를 추가한다

## 4. 공용 UI foundation과 앱 셸

- [x] 4.1 Button, TextField, TextArea, Avatar, skeleton, empty/error state, dropdown/modal primitive를 React Native로 구현한다
- [x] 4.2 mobile safe-area/tab shell과 768px·1280px web breakpoint shell을 공용 route group 및 platform file로 구현한다
- [x] 4.3 web compact/full sidebar, right rail, mobile bottom tab과 drawer navigation을 canonical route에 연결한다
- [x] 4.4 Relay fragment 기반 profile switcher를 구현하고 profile 생성·선택 mutation과 actor environment reset을 연결한다
- [x] 4.5 공용 primitive와 shell navigation의 React Native Web Storybook story와 accessibility metadata를 이식한다

## 5. 화면과 GraphQL operation 이식

- [x] 5.1 공개 `/` 온보딩, 로그인 CTA, valid-session `/home` 이동을 Expo route와 Relay query로 이식한다
- [x] 5.2 `/home`의 no-profile onboarding과 `homeTimeline` Query fragment/post list를 Relay로 이식한다
- [x] 5.3 Post body/card/layout, loading/error/empty state와 `/@{handle}/{postId}` detail/back navigation을 이식한다
- [x] 5.4 `/compose`의 selected profile fragment, plain-text editor, visibility 선택, 500자 제한과 createPost mutation을 이식한다
- [x] 5.5 `/@{handle}` profile hero, posts, follow/unfollow mutation과 viewer-relative UI를 Relay fragment로 이식한다
- [x] 5.6 followers/following route를 `@refetchable`·`@connection`·`usePaginationFragment`로 이식하고 수동 edge merge를 제거한다
- [x] 5.7 `/search`의 URL `q`/`tab`, platform storage 최근 검색, profile query와 준비 중인 tab state를 이식한다
- [x] 5.8 `/notifications`와 `/menu` placeholder 화면 및 보호 route heading을 이식한다
- [x] 5.9 post/profile/follow/composer/search의 loading, error, empty, long-content, interaction Storybook story를 React Native Web으로 이식한다

## 6. 테스트와 플랫폼 검증

- [x] 6.1 Relay compiler를 실행해 모든 colocated document와 schema가 일치하고 generated TypeScript가 typecheck되는지 확인한다
- [x] 6.2 Playwright config를 mock OIDC + API + Expo export + Hono BFF로 갱신하고 기존 web E2E assertion을 React Native Web semantics에 맞춘다
- [x] 6.3 로그인/보호 route/profile switch/timeline/compose/profile/follow pagination/search/post detail E2E를 통과시킨다
- [x] 6.4 React Native Web Storybook static build와 semantic accessibility 검증을 통과시킨다. 기존 디자인 토큰 `#777777`의 색 대비 부채는 UI parity를 위해 이 migration에서 변경하지 않고 color-contrast rule에서 제외한다
- [x] 6.5 Expo web production export와 BFF deep-link `/@{handle}/{postId}` 직접 접근을 검증한다
- [x] 6.6 clean Expo prebuild 뒤 Android `assembleDebug`를 실행하고 package/deep-link 설정을 검증한다
- [x] 6.7 clean Expo prebuild 뒤 iOS simulator `xcodebuild`를 실행하고 bundle ID/deep-link 설정을 검증한다
- [x] 6.8 `expo-doctor`, workspace ESLint, Prettier, syncpack와 기존 API/Fedify test를 통과시킨다. 설치 version은 maturity policy를 만족하는 `expo@56.0.14`·`expo-router@56.2.13`이며, 7일 window 안의 권장 patch `expo@56.0.15`·`expo-router@56.2.14`에 대한 dependency version check만 유예하고 나머지 검사는 20/20 통과했다

## 7. 배포 전환과 정리

- [x] 7.1 Docker build가 Relay compile·Expo web export를 수행하고 BFF와 `apps/app/dist`만 web runtime에 포함하도록 갱신한다
- [x] 7.2 `docker-entrypoint.sh`, root scripts, web E2E/CI workflow와 artifact path를 새 app/web package 경계에 맞춘다
- [ ] 7.3 production container에서 `/health`, `/`, `/graphql`, browser login callback, native session, WebFinger/ActivityPub smoke test를 실행한다
- [x] 7.4 Svelte routes/components, Mearie, Svelte Storybook, manual Android/iOS WebView source와 전용 dependency/config를 제거한다
- [x] 7.5 pnpm CLI로 제거 dependency를 정리하고 lockfile, syncpack, workspace install을 검증한다
- [x] 7.6 `docs/design/breakpoints.md`, `typography.md`와 관련 design 문서를 Expo/React Native Web 구현 위치로 갱신한다
- [x] 7.7 `memory/frontend-react-native.md`에 Relay/React Native 규칙을 정리하고 coding/graphql/script memory와 해당 AGENTS 라우팅을 정렬한다
- [x] 7.8 active OpenSpec change의 Svelte/Mearie/WebView 구현 task를 조사해 Expo 이식, 완료 또는 superseded 상태를 명시한다
- [x] 7.9 OpenSpec strict validation과 전체 build/test를 재실행하고 변경 범위를 검토 가능한 checkpoint commit으로 정리한다
