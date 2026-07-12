# Frontend React Native Memory

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

## Relay Colocation

- GraphQL query, mutation, fragment document는 실제로 사용하는 `.tsx` 파일에 `graphql` tag로 둔다.
- route는 `useLazyLoadQuery`로 화면 query를 소유하고, GraphQL entity를 소비하는 자식은 자신의 fragment를 선언해 generated `{FragmentName}$key`를 prop으로 받는다.
- 부모는 자식 fragment를 spread하고 fragment ref를 그대로 넘긴다. `id`, `handle`, `displayName` 같은 field subset을 수동 scalar prop으로 복제하지 않는다.
- 한 컴포넌트가 여러 부모 query에서 재사용되더라도 document를 공용 query helper로 빼지 않는다. 재사용 경계는 query가 아니라 fragment다.
- operation name은 화면/컴포넌트 책임을 드러내는 기존 이름을 유지한다. Relay network request body는 `operationName`, persisted text가 아닌 `request.params.text`, `variables`를 포함해 API와 E2E interception 계약을 지킨다.
- generated `__generated__` artifact는 commit하지 않는다. schema 또는 document가 바뀌면 `pnpm --filter @kosmo/app relay`를 실행하고 `check`/build에서도 compiler를 선행한다.
- `DateTime` 같은 custom scalar는 `apps/app/relay.config.json`에서 native-safe TypeScript type으로 매핑한다. DOM 기반 editor type을 scalar boundary에 넣지 않는다.

## Relay Environment And Mutations

- web request는 same-origin BFF `/graphql`과 HttpOnly cookie를 사용하고, native request는 SecureStore에서 복원한 session token을 Bearer로 같은 BFF에 보낸다. Native SecureStore 값은 validated web origin과 token을 같이 저장하고 현재 origin과 다르면 삭제하여 환경 전환 후 이전 bearer를 전송하지 않는다. UI code가 web cookie를 직접 읽거나 native token을 URL에 넣지 않는다.
- `Session.selectedProfile.id`가 바뀌면 Relay Environment와 Store를 새로 만든 뒤 현재 route query를 새 actor 기준으로 실행한다. `homeTimeline`, `viewerState`, `viewerFollow`를 수동 필드 목록으로 invalidate하지 않는다.
- mutation 응답은 영향받는 Node의 `id`와 변경된 필드를 선택해 Relay normalized store가 갱신되게 한다. connection membership 변경이 필요할 때만 Relay connection directive 또는 좁은 updater를 사용한다.
- 새 게시글의 Home/Profile 목록 membership은 현재 `createPost` updater가 아니라 후속 Relay subscription이 소유한다. subscription 전에는 게시 성공 후 열린 목록이 refetch 전까지 갱신되지 않는 제한을 수용하며 임시 `@prependNode`를 추가하지 않는다.
- profile 선택 mutation은 payload UI 갱신과 actor environment reset을 모두 수행한다. 이전 actor Store를 새 profile에 재사용하지 않는다.
- GraphQL/network 오류는 공용 error boundary와 한국어 fallback을 사용한다. backend `message` 원문 노출 정책이 확정되지 않은 흐름에서는 컴포넌트마다 ad hoc 분기를 만들지 않는다.

## Relay Connections

- followers/following처럼 다음 페이지가 필요한 fragment는 `@argumentDefinitions`, `@refetchable`, `@connection`을 선언하고 `usePaginationFragment`로 읽는다.
- route state에서 edge를 수동 concat하거나 cursor 중복 제거 helper를 만들지 않는다. Relay connection identity와 `loadNext`가 누적을 소유한다.
- 다음 페이지 로딩 중에는 중복 요청을 막고, 실패해도 기존 edge를 유지하며 같은 위치에서 재시도할 수 있게 한다. `hasNext`가 false면 load-more action을 숨긴다.
- connection key는 component와 관계가 드러나는 안정적인 이름을 사용한다. filter argument가 생기면 `filters`를 명시해 서로 다른 목록이 같은 connection으로 합쳐지지 않게 한다.

## React Native Components And Styles

- `View`, `Text`, `TextInput`, `Pressable`, `Modal`, `ScrollView` 등 React Native primitive를 기본으로 사용한다. browser-only element나 DOM API는 platform 경계 밖의 공용 컴포넌트에 넣지 않는다.
- 색상, spacing, radius, typography, breakpoint는 `apps/app/src/theme` token을 사용한다. 일회성 raw hex/숫자로 Foundation 값을 복제하지 않는다.
- UI 텍스트는 `SUIT`, 포스트 본문과 긴 입력은 `Pretendard`를 사용한다. React Native에는 CSS 상속이 없으므로 공용 primitive 또는 각 `Text`/`TextInput` style에서 family를 명시한다.
- touch target은 최소 44×44를 확보하고 `accessibilityRole`, `accessibilityLabel`, `accessibilityState`를 실제 동작과 맞춘다. 선택 tab, disabled/loading button, modal/drawer 상태는 시각 표현만으로 전달하지 않는다.
- `useWindowDimensions`로 layout 단계를 고르되 product breakpoint 값은 token에서 읽는다. render 중 플랫폼 전역 `window`를 직접 읽지 않는다.
- 게시글 write/read 계약은 canonical `bodyText`다. composer는 trim된 Plain Text를 `CreatePostInput.bodyText`로 직접 제출하고 조회는 저장된 `bodyText`를 표시한다. 앱은 `@kosmo/core/validation/post-policy`와 `@kosmo/core/validation/profile` 같은 native-safe subpath만 import하며 TipTap/ProseMirror runtime이나 document adapter를 포함하지 않는다.

## Storybook

- 상태 카탈로그는 `apps/app`의 React Native Web Storybook을 사용한다. Svelte story나 UI package를 병행하지 않는다.
- Relay fragment component story는 production fragment ref 계약을 유지하는 Relay mock environment/payload를 사용한다. raw object를 `$key`로 cast해 runtime contract를 우회하지 않는다.
- loading, error, empty, long display name/handle/content, selected/disabled, pagination retry와 platform width 상태를 포함한다.
- interactive element에는 접근성 metadata를 넣고 Storybook a11y 검증과 web static build를 함께 통과시킨다.

## UI And Copy

- 프로필 표시 문자열은 `Profile.relativeHandle`을 사용하고 `Profile.handle`은 lookup, validation, route parameter 정규화에만 사용한다.
- backend error `message`를 그대로 노출할지 error code로 분기할지는 공용 정책에서 결정한다. 정책이 없으면 안전한 한국어 fallback을 우선한다.
- Figma/OpenSpec 수치와 theme token이 다르면 같은 변경에서 정렬한다. 긴 문자열, 빈 값, RTL/줄바꿈처럼 layout을 깨뜨릴 수 있는 상태는 story 또는 test에 포함한다.
