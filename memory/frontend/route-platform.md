# Frontend: Route And Platform

Read this entire file when working on Expo Router routes, the shared Web/Native shell, or platform-specific UI boundaries.

## Purpose

- `apps/app`의 Expo Router, React Native/React Native Web, React Relay, Storybook 컴포넌트를 구현하거나 리뷰할 때 이 메모를 적용한다.
- `apps/app`은 Android/iOS/Web에서 공유하는 유일한 UI와 route tree를 소유한다. `apps/web`은 Expo web asset, 로그인, GraphQL proxy, ActivityPub을 제공하는 Hono BFF이며 UI를 소유하지 않는다.
- fragment colocation, actor별 Relay cache, universal UI semantics와 상태 카탈로그를 플랫폼 간에 일관되게 유지한다.

## Route And Platform Boundaries

- canonical route는 `apps/app/src/app`의 Expo Router file route로 정의한다. 같은 화면을 web 전용 route tree에 다시 만들지 않는다.
- 공용 화면과 컴포넌트는 React Native primitive로 작성한다. 실제 platform API나 DOM 동작이 다른 경우에만 `.web.tsx`, `.native.tsx` 같은 platform file을 사용한다.
- route component는 URL parameter와 top-level query를 소유한다. 표시 컴포넌트는 Expo Router parameter나 navigation singleton을 직접 읽지 않고 필요한 callback 또는 fragment ref를 받는다.
- 프로필 route에는 표시용 `relativeHandle`과 lookup용 bare/federated handle을 혼동하지 않는다. URL을 만들 때는 `relativeHandle`, GraphQL lookup/validation에는 정규화한 route parameter를 사용한다.
- web shell은 `768px`와 `1280px` breakpoint를 사용한다. native shell은 화면 폭과 무관하게 mobile layout을 유지하고 safe area를 기준으로 한다. 값은 `apps/app/src/theme/tokens.ts`의 `breakpoints`를 사용하며 컴포넌트마다 같은 숫자를 다시 쓰지 않는다.
- web 링크가 새 탭 열기, 주소 복사, 키보드 활성화 같은 browser 의미를 가져야 하면 Expo Router `Link`를 사용한다. local action은 `Pressable`/`Button`을 사용하고 접근성 role, label, state를 함께 지정한다.
