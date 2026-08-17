## Context

`PROD-610`은 Web의 홈 헤더 브랜드 마크와 shell 홈 navigation 항목을 같은 홈 진입 control로 맞추고, 현재 홈 재선택에는 document 최상단 이동과 단일 Home Relay 새로고침을 요구한다. 기존 `reset-primary-navigation-scroll` change는 현재와 다른 주요 route의 forward navigation만 소유하고 same-route 홈 재선택과 Relay 새로고침을 명시적으로 제외한다.

현재 모든 shell 홈 항목은 `NavigationLink`를 공유하지만 현재 pathname과 같은 target에는 별도 activation 경로가 없다. `ShellChromeContext` provider는 shell과 route `Slot`을 이미 함께 감싸고 Home route도 이 context를 사용한다. Home은 `useLazyLoadQuery(HomePageQuery)`의 `fetchKey`를 RouteBoundary retry에 사용하지만 이 방식은 네트워크 완료 신호를 제공하지 않는다. Relay `fetchQuery`의 observable completion과 요청 중 `ref` 잠금은 저장소에 기존 사용례가 있다. `PageHeader`의 브랜드 마크는 현재 접근성 트리에서 숨긴 장식 요소다.

## Goals / Non-Goals

**Goals:**

- 모든 Web shell 단계의 홈 진입 control에 같은 route 이동 또는 current-home 재선택 결과를 제공한다.
- current-home 재선택마다 document scroll을 최상단으로 이동하고 진행 중 요청이 없을 때만 Home Relay 새로고침을 한 번 실행한다.
- 성공·실패 시 요청 잠금을 정확히 해제하고 실패해도 현재 timeline을 유지한다.
- 브랜드 마크의 시각 geometry를 유지하면서 pointer·keyboard·screen reader activation을 제공한다.
- 기존 shell/context/Relay 패턴을 재사용하고 새 dependency나 전역 event infrastructure를 추가하지 않는다.

**Non-Goals:**

- `reset-primary-navigation-scroll`의 forward navigation·history restoration 정책 변경
- 다른 현재 route 재선택, Android/iOS Native 동작 또는 중앙 피드 internal scroller 도입
- PageHeader 브랜드 자산·geometry 변경
- GraphQL schema·서버 timeline 정책, subscription 또는 새 Post prepend 변경
- 새 공용 refresh framework나 모든 route용 reselection abstraction 도입

## Implementation Guidance

### Current Constraints

- `NavigationLink`의 기존 `onNavigate`는 mobile drawer close 같은 forward navigation 후처리에 사용된다. 같은 prop에 current-route refresh를 섞으면 drawer lifecycle과 local refresh 의미가 결합된다.
- `PrimaryNavigationScrollContext`는 다른 pathname으로 이동하는 intent와 commit을 연결한다. current-home 재선택을 이 token 흐름에 넣으면 PROD-619의 same-route no-op 경계를 깨뜨린다.
- visible Home query의 기존 `fetchKey`는 초기 로드·blocking retry와 current-home 재선택을 모두 소유한다. Relay의 동일 environment·operation·variables in-flight dedupe가 진행 중 중복을 소유하므로 재선택 전용 완료 신호나 잠금이 필요하지 않다. 재검증 실패는 Home-local error boundary가 같은 actor의 마지막 성공 데이터를 유지하고, actor revision이 다른 데이터는 사용하지 않는다.
- `PostList_home`은 refetchable fragment지만 shell activation을 중첩된 PostList owner까지 전달하려면 추가 callback 경계와 pagination 회귀 검증이 필요하다.
- 기존 브랜드 마크 wrapper는 `aria-hidden`이고 pointer event를 받지 않으므로 handler만 붙여서는 접근 가능한 control이 되지 않는다.

### Recommended Approach

기존 `ShellChromeContext`에 stable Home 재선택 activation과 Home route handler 등록 경계를 추가한다. provider는 새 React state로 전체 shell을 갱신하지 않고 등록된 handler를 stable ref로 보관하며, Home route가 unmount되면 등록을 해제한다. 새 context, module singleton이나 browser custom event는 만들지 않는다.

`NavigationLink`에는 target pathname이 현재 pathname과 같을 때만 실행되는 별도 optional callback을 둔다. current-home callback이 있으면 guarded route navigation을 시작하지 않고 local reselection handler를 실행한다. 다른 pathname, modifier click, 새 탭, 취소·승인 navigation과 기존 `onNavigate` 동작은 유지한다. shell의 홈 항목만 이 callback을 연결하고 다른 current-route 항목에는 적용하지 않는다.

Home route handler는 Web에서 activation마다 document scroll을 최상단으로 이동하고 기존 visible Home query의 `fetchKey`를 증가시킨다. Home query reader와 data renderer를 분리하고, reader가 `useLazyLoadQuery(HomePageQuery, {}, { fetchKey, fetchPolicy: 'store-and-network' })`에서 반환한 데이터를 actor revision과 함께 Home route ref에 동기적으로 기록한다. reader를 감싼 Home-local error boundary는 같은 actor의 마지막 성공 data를 stale timeline으로 렌더하고, stale data가 없으면 오류를 다시 던져 기존 RouteBoundary가 blocking error를 표시하게 한다. boundary는 actor revision이 포함된 fetchKey 변화에서 오류 상태를 reset해 다음 activation과 retry가 새 query를 시도하되, 성공 상태의 PostList는 불필요하게 remount하지 않는다. Home screen이 유지되는 동안 현재 environment에 해당 operation을 `retain`하고 cleanup하며, 재검증 전용 `fetchQuery` subscription·token lock은 두지 않는다. Relay의 동일 environment·operation·variables in-flight dedupe가 진행 중 중복 요청을 억제한다. actor environment 전환으로 이전 Store와 새 Store가 분리되고 stale ref도 revision으로 격리되지만 일반 query의 실제 network cancellation은 보장하지 않는다.

모바일 shell Home header와 compact/full Home route의 `PageHeader`는 같은 Home 재선택 activation을 사용한다. `PageHeader`의 brand variant에는 handler가 제공된 경우에만 실제 focusable navigation control을 렌더하고, accessible name `홈`, keyboard activation과 기존 focus-visible 동작을 제공한다. 브랜드 mark의 크기·배치와 header title 의미는 유지한다.

### Allowed Alternatives

- 현재 Active decision 아래에서는 같은 Home query의 완료 신호와 normalized store 갱신을 제공하는 기존 Relay query-loader 패턴을 사용할 수 있다. 새 public refresh abstraction이나 route별 공용 framework로 일반화하지 않는다.

### Known Traps

- 고정 debounce/throttle 시간으로 중복을 추정하지 않는다. 긴 요청에는 중복이 생기고 짧은 요청에는 불필요한 지연이 생긴다.
- 요청 중 activation 전체를 무시하지 않는다. 네트워크 요청만 억제하고 scroll-top은 매번 실행해야 한다.
- current-home activation을 `PrimaryNavigationScrollContext.record()`나 기존 `onNavigate`에 끼워 넣지 않는다.
- `fetchKey` 변경과 별도 `fetchQuery`를 같은 activation에서 함께 실행해 네트워크 요청을 두 번 만들지 않는다.
- `aria-hidden` 장식 wrapper에 press handler만 붙이거나 brand mark와 별도 중복 focus target을 만들지 않는다.

## Risks / Trade-offs

- [HomePageQuery 전체를 다시 요청해 timeline 외 session·profile field도 갱신한다] → 별도 fragment callback plumbing을 만들지 않는 대가로 받아들인다. Web 자동화는 request count와 오류 시 기존 timeline 유지를 검증하며, 변경된 서버 데이터의 normalized UI 반영과 기존 loaded pagination 유지는 별도 runtime 검증 범위로 남긴다.
- [actor environment가 바뀐 뒤 이전 일반 query가 계속 실행될 수 있다] → actor별 Relay environment·Store 분리와 revision-tagged stale ref로 이전 응답·data가 새 actor UI에 적용되지 않는다. 현재 environment의 retain은 Home screen lifecycle에 맞춰 해제하며, 실제 network cancellation이 필요하면 별도 query subscription lifecycle을 재검토한다.
- [context 값 변경이 shell 전체 재렌더를 만들 수 있다] → handler 등록과 activation API를 stable callback/ref로 유지한다.
- [PageHeader의 접근성 트리가 중복된 `홈` 이름을 노출할 수 있다] → brand control의 link name과 header 의미를 각각 검증하고 숨겨진 장식 mark는 별도 focus target으로 노출하지 않는다.

## Migration Plan

DB·GraphQL schema·서버 migration은 없다. Web client 코드와 자동화를 한 PR에서 배포한다. 회귀가 확인되면 Home current-route callback과 brand control만 제거해 기존 forward navigation과 decorative PageHeader로 되돌릴 수 있다.

## Open Questions

없음.
