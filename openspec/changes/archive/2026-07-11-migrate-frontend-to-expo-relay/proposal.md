## Why

현재 프론트엔드는 SvelteKit 웹 앱과 Kotlin/Swift WebView 셸로 분리되어 있어 화면과 내비게이션을 플랫폼별로 공유할 수 없고, GraphQL 클라이언트 계약도 웹 전용 Mearie 구현에 묶여 있다. Expo + React Native Web과 Relay로 하나의 유니버설 클라이언트를 구성해 Android, iOS, Web에서 같은 화면·라우트·정규화 캐시 계약을 사용한다.

## What Changes

- **BREAKING** `apps/app`의 Android/iOS WebView 셸을 Expo SDK 56 + Expo Router 기반 React Native 앱으로 교체한다.
- **BREAKING** `apps/web`의 Svelte UI와 Mearie 클라이언트를 제거하고, Expo 웹 산출물을 제공하는 로그인·GraphQL proxy·ActivityPub 호환 BFF로 축소한다.
- 공개 온보딩, 보호 화면, 홈 타임라인, 글쓰기, 검색, 프로필, 팔로우 목록, 게시글 상세를 Android/iOS/Web 공용 React Native 컴포넌트와 Expo Router 경로로 제공한다.
- GraphQL operation을 React 컴포넌트에 colocate하고 Relay Compiler가 TypeScript 타입과 runtime artifact를 생성하도록 한다.
- 웹은 기존 HttpOnly 세션 쿠키 흐름을 유지하고, 네이티브는 시스템 브라우저 PKCE 로그인 뒤 발급받은 Kosmo 세션 토큰을 SecureStore에 저장해 Bearer 요청에 사용한다.
- BFF의 browser/native OIDC code 교환은 issuer discovery와 JWKS 서명·claims 검증을 제공하는 표준 OIDC client를 사용한다.
- 기존 `/health`, `/login`, `/login/callback`, `/graphql`, Fedify가 소유하는 federation 경로와 Kubernetes web workload 계약을 유지한다.
- Svelte/Mearie 및 수동 Gradle/Xcode WebView 빌드 도구를 제거하고, 기존 상태 카탈로그는 React Native Web Storybook으로 이식한다.

## Capabilities

### New Capabilities

- `universal-expo-client`: Expo Router 기반 Android/iOS/Web 공용 화면, 라우팅, 플랫폼 적응형 셸, Relay 환경과 생성 artifact 계약을 정의한다.

### Modified Capabilities

- `native-webview-client`: WebView 호스팅 계약을 네이티브 렌더링 Expo 클라이언트와 PKCE/SecureStore 세션 계약으로 교체한다.
- `session-auth`: 네이티브 authorization code 교환 및 Kosmo 세션 토큰 발급 흐름을 추가하고 웹 쿠키 흐름과 분리한다.
- `web-api-bridge`: Mearie transport를 Relay network로 교체하고 쿠키 또는 명시적 Bearer token을 API로 전달한다.
- `web-app-shell`: SvelteKit 전용 셸·fragment 표현을 Expo Router와 Relay 기반 유니버설 셸 계약으로 바꾼다.
- `web-platform`: SvelteKit 런타임을 Expo 웹 산출물과 경량 BFF 런타임으로 교체하면서 health·폰트 self-hosting 계약을 유지한다.

## Impact

- 주요 변경 경로: `apps/app`, `apps/web`, `Dockerfile`, `docker-entrypoint.sh`, `.github/workflows`, `docs/design`, `memory`, `openspec/specs`.
- 추가 의존성: Expo SDK/Router, React, React Native/Web, React Relay/Relay Compiler, Expo AuthSession/SecureStore, Hono 정적 서버 계층, `openid-client`, React Native Web Storybook.
- 제거 의존성: Svelte/SvelteKit, Mearie, Svelte Storybook, 수동 Android/iOS WebView 프로젝트 의존성.
- API GraphQL schema와 도메인 resolver shape는 유지하되 web BFF 인증 및 transport 계약이 확장된다.
- 웹 배포는 기존 web workload와 origin을 유지하고, 네이티브 빌드는 Expo CLI/EAS 호환 프로젝트 구조로 전환된다.
