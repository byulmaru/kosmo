## Context

GraphQL의 `homeTimeline`과 `Profile.posts`는 이미 cursor와 `pageInfo`를 제공하는 `PostConnection`이지만, 현재 앱은 두 목록 모두 첫 20개만 렌더한다. Home은 root-scoped `PostList_homeTimeline` Relay connection을 사용하고 새 Post mutation도 같은 connection ID에 prepend한다. Profile 목록은 Profile fragment에서 `posts(first: 20)`만 읽고 pagination owner가 없다.

PROD-662에서 `useAutomaticPagination`이 Web document/container와 Native scroll metric, in-flight guard, 성공 후 재측정, 실패 후 수동 retry lifecycle을 공통화했다. 이 change는 그 lifecycle을 수정하거나 복제하지 않고 Home/Profile Relay pagination과 사용자 feedback를 연결한다.

Home의 ScrollView는 Home frame이, Profile의 Native ScrollView는 Profile layout이 소유한다. 실제 pagination data를 읽는 Post 목록은 그 아래에 있으므로, 내부에 새 ScrollView를 만들면 기존 header·hero·scroll position과 Native metric이 분리된다.

## Goals / Non-Goals

**Goals:**

- Home과 Profile에 서로 독립적인 20개 단위 Relay pagination을 연결한다.
- 두 surface가 완료된 공통 자동 pagination lifecycle과 기존 feedback·theme component를 재사용한다.
- 다음-page loading·failure·retry 동안 기존 게시글과 scroll position을 유지한다.
- Profile handle·actor revision과 Home actor 전환 시 pagination UI state를 격리한다.
- Home prepend connection identity와 pagination ordering을 유지한다.

**Non-Goals:**

- GraphQL schema·resolver, Post visibility·eligibility·ordering 또는 cursor 정책 변경
- 공개·추천·Local Timeline과 Subscription runtime 통합
- Home 재선택 scroll-top·refresh 동작
- 범용 connection-list framework나 pagination hook 재설계
- 실제 Android·iOS 기기 검증을 Web 자동화로 대체하는 것

## Implementation Guidance

### Current Constraints

- Home root query와 Profile identity는 같은 Post item을 렌더해도 Relay pagination owner가 다르므로 하나의 connection으로 합칠 수 없다.
- Profile fragment는 `@argumentDefinitions`, `@refetchable`, `@connection`과 `pageInfo`가 없고 Home source fragment도 compiler가 생성한 metadata를 pagination data로 소비하지 않는다.
- Home prepend updater는 `PostList_homeTimeline` connection key에 의존하므로 key를 바꾸면 새 Post와 다음 page가 서로 다른 managed connection에 반영된다.
- 공통 hook의 Native 결과는 실제 ScrollView의 `onLayout`, `onContentSizeChange`, `onScroll`에 연결돼야 한다. Post 목록 내부 View에 붙이거나 중첩 ScrollView를 추가하면 올바른 metric을 얻지 못한다.
- 다음-page 실패는 초기 query error boundary와 다르다. 기존 edge를 유지한 채 공통 hook의 error 상태와 toast action으로 복구해야 한다.

### Recommended Approach

Home root와 Profile 각각에 refetchable pagination fragment를 두고 `usePaginationFragment`가 해당 connection의 edge, `hasNext`, `isLoadingNext`, `loadNext`를 소유하게 한다. 공통 Post item presentation은 유지하되 surface 선택에 따라 서로 다른 fragment owner를 명시적으로 소비한다.

Post 목록 pagination 경계에서 `useAutomaticPagination`에 현재 edge 수, page size 20과 Relay pagination 결과를 전달한다. Web은 현재 document scroll을 사용하고, Native는 좁은 registration boundary를 통해 hook이 반환한 metric handler를 기존 Home frame/Profile layout ScrollView에 전달한다. registration은 해당 목록이 unmount되면 해제하며 다른 route의 scroll 동작을 소유하지 않는다.

다음 page 요청 중에는 목록 아래에 React Native 기본 spinner와 polite live status를 표시한다. 실패 전환 시 기존 `ToastProvider`에 한 번만 오류 문구와 `다시 시도` action을 전달하고, action은 공통 hook의 수동 retry를 호출한다. 초기 query loading/error/empty presentation은 그대로 유지한다.

actor revision과 Profile handle을 목록 subtree identity에 반영해 owner가 바뀌면 hook의 in-flight/error state와 scroll registration을 함께 remount한다. 이전 Relay Environment에서 늦게 끝난 요청은 새 owner state에 연결하지 않는다.

Relay compiler로 생성 artifact를 갱신하고, Home connection key와 Profile identity argument가 source fragment와 일치하는지 검증한다.

### Allowed Alternatives

- Home/Profile별 얇은 pagination wrapper를 둘 수 있고 하나의 Post 목록 controller에서 nullable owner를 선택할 수도 있다. 어느 방식이든 hooks를 조건부 호출하지 않고 두 connection identity를 분리하며 공통 lifecycle을 복제하지 않아야 한다.
- Native handler 전달은 route nesting에 맞춘 좁은 context registration 또는 명시적 callback 전달을 사용할 수 있다. 앱 전역 scroll registry로 확장하거나 새 ScrollView를 중첩해서는 안 된다.

### Known Traps

- generated artifact에 `pageInfo`가 있다는 이유로 source fragment가 pagination-ready라고 판단하지 않는다.
- Home connection key를 바꾸거나 client에서 prepend/append edge를 수동 합성하지 않는다.
- Web document listener와 Native ScrollView handler를 같은 platform에서 중복 연결하지 않는다.
- 실패 toast를 render마다 다시 열거나 toast dismiss를 자동 retry 신호로 사용하지 않는다.
- 첫 page 오류 UI로 다음-page 오류를 대체해 기존 목록을 숨기지 않는다.

## Risks / Trade-offs

- [부모 ScrollView와 자식 pagination owner 사이에 작은 registration seam이 추가됨] → Home/Profile 두 실제 owner로 범위를 제한하고 unmount cleanup과 source test를 둔다.
- [기존 ToastProvider action은 3초 뒤 닫힘] → 현재 승인된 toast UX와 공용 provider를 유지하고 runtime에서 action·announcement를 확인한다. 지속형 inline retry나 provider API 확장은 별도 제품 결정 없이 추가하지 않는다.
- [Relay fragment 전환이 Home prepend identity를 깨뜨릴 수 있음] → 기존 connection key를 보존하고 prepend 후 next-page 누적을 집중 검증한다.
- [Web 자동화가 Native metric을 완전히 증명하지 못함] → 공통 hook의 Native unit test, source mapping과 실제 실행한 runtime QA를 분리해 보고한다.

## Migration Plan

1. OpenSpec strict validation 뒤 client fragment와 scroll registration을 additive하게 구현한다.
2. Relay artifact를 재생성하고 focused unit·route·Storybook/browser 검증을 수행한다.
3. Web runtime에서 Home/Profile near-end, spinner, toast retry와 scroll 유지 동작을 확인한다.
4. 회귀 시 client change를 되돌린다. API·DB migration이나 데이터 backfill은 없다.

## Open Questions

없음.
