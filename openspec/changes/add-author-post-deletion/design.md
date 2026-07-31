## Context

Post 삭제 domain, Core service와 GraphQL `deletePost` resolver는 이미 Author 권한, Active→Tombstone 전이와 `postId` payload를 구현한다. 앱은 이 mutation을 Repost 취소에만 사용하며, `PostActionBar`의 More는 현재 optional callback-only control이고 실제 목록·상세 surface에서는 연결되지 않았다. 공용 `ActionMenu`는 Web anchored menu와 Native bottom action sheet를 이미 제공하지만 destructive item tone과 삭제 확인 UI는 없다.

PROD-598은 기존 server behavior를 바꾸지 않고 Home·Profile Post List와 Post 상세의 Action Bar target에 작성자 삭제를 연결한다. Relay environment는 selected Profile 전환마다 교체되므로 mutation completion과 cache update는 요청을 시작한 actor Store에만 적용되어야 한다. 목록 fragment 일부는 Relay `@connection`으로 관리되지 않으므로 record 삭제만으로 모든 표시 edge가 안전하게 사라진다고 가정할 수 없다.

## Goals / Non-Goals

**Goals:**

- 기존 GraphQL resolver 경계를 integration evidence로 고정하고 Core/DB 계약을 재사용한다.
- Action Bar의 케밥 More trigger에서 작성자에게만 삭제 항목과 확인 flow를 제공한다.
- 서버 성공 이후 현재 actor Store의 목록·상세를 삭제 결과에 맞추고 실패·취소에는 cache를 보존한다.
- Web·Android·iOS의 기존 menu 패턴, 접근성, focus 복구와 pending 중복 차단을 유지한다.
- 일반 Post·Reply·Quote·Reply이면서 Quote와 순수 Repost Source target을 같은 계약으로 검증한다.

**Non-Goals:**

- Core service, DB schema, GraphQL schema shape와 ActivityPub Delete delivery를 재설계하지 않는다.
- physical delete, 복구·삭제 취소, 원격 Post 사용자 삭제와 PROD-121 조회 정책을 구현하지 않는다.
- PROD-432의 링크 복사 또는 전체 Action Bar 통합을 대신 완료하지 않는다.
- 신고·숨기기·차단 등 다른 More 항목을 미리 추가하지 않는다.

## Implementation Guidance

### Current Constraints

- `apps/api/src/graphql/resolvers/post/mutation/delete.ts`는 이미 `usingProfile`, concrete Post global ID, Core service 호출과 global `postId` payload를 제공한다. behavior가 spec과 일치하면 source 변경보다 기존·추가 integration test가 완료 증거다.
- `PostActionBar`는 More callback과 접근성 label만 받으며 menu state를 소유하지 않는다. menu·mutation을 toolbar container에 직접 섞으면 private child가 자기 fragment와 처리 상태를 소유하는 기존 구조가 깨진다.
- `RepostAction`은 fragment, `ActionMenu`, mutation, actor environment 전환과 중복 입력을 함께 처리하는 가까운 선행 패턴이다.
- 순수 Repost의 Action Bar는 바깥 Repost가 아니라 direct Source fragment를 target으로 사용한다. 삭제 mutation ID와 Author eligibility도 이 target을 따라야 한다.
- `PostList_profile`과 `PostList_homeTimeline`은 모두 Post connection shape를 읽지만 현재 모든 connection이 Relay declarative connection handle로 등록된 것은 아니다. `postId @deleteRecord` 또는 `store.delete(postId)`만 적용하면 edge·nested Source reference가 남거나 non-null fragment 가정을 깨뜨릴 수 있다.
- More menu가 item을 선택하며 trigger focus를 복구하는 시점과 확인 dialog가 초기 focus를 받는 시점이 겹칠 수 있다. menu dismiss가 끝난 뒤 dialog focus를 확정해야 한다.

### Recommended Approach

- Repost action과 같은 post-module private child로 More menu를 구성한다. child는 target Post fragment에서 ID, lifecycle/content 존재와 Author ID를 읽고 `useSession()`의 selected Profile ID와 비교해 `삭제` item을 파생한다. `PostActionBar`는 고정 순서와 control 조립만 유지한다.
- 공용 `ActionMenuItem`에는 기존 item을 깨뜨리지 않는 optional destructive tone·accessible name을 추가한다. default item은 현재 색과 semantics를 유지하고 삭제 item만 `Trash2`와 theme `danger`를 사용한다.
- 확인 UI는 현재 한 곳에서만 필요하므로 post feature 안의 작은 modal component로 시작한다. Web `alertdialog`, Native modal semantics, 안전한 초기 focus, pending 전 dismiss와 focus return을 한 경계에서 처리하고 실제 재사용 요구가 생길 때만 공용 primitive로 승격한다.
- 삭제 mutation에는 optimistic response/updater를 두지 않는다. 요청 시작 environment와 현재 environment를 비교하는 guard와 별도 in-flight ref를 사용해 actor 전환 뒤 이전 callback이 새 UI state나 Store를 바꾸지 않게 한다.
- 성공 updater는 payload의 `postId`를 source of truth로 사용해 현재 actor Store의 target record와 표시 surface를 정리한다. default는 target record 제거와 함께 Home·Profile 목록, 상세 thread 및 pure Repost의 nested Source가 현재 render에서 남지 않는지 실제 Relay payload test로 확인하고 필요한 edge/reference 정리를 같은 updater 또는 surface reader에 추가하는 방식이다. 구현 세부 방식보다 모든 관련 surface가 Active content를 더 이상 표시하지 않는 결과를 우선한다.
- 실패는 mutation state만 복구하고 확인 dialog를 유지한 채 기존 toast host로 error callback을 전달한다. GraphQL `onCompleted`의 `errors`와 transport `onError`를 모두 동일한 실패 경계로 처리한다.
- API integration은 기존 resolver가 Author·비Author·guest·잘못된 global ID에서 Core 호출과 결과를 올바르게 전달하는지 재검증한다. 이미 충분한 test가 있으면 중복 test를 추가하지 않고 현재 증거를 task 결과에 기록한다.

### Allowed Alternatives

- Relay 성공 동기화는 declarative `@deleteRecord`와 explicit connection cleanup, feature-local updater, 또는 성공 뒤 현재 surface refetch 중 하나를 사용할 수 있다. 서버 성공 전 cache를 바꾸지 않고 현재 actor Store만 갱신하며 목록·상세·pure Repost Source 시나리오가 독립 테스트로 증명되면 허용한다.
- 확인 UI는 같은 semantics, copy, focus와 pending 계약을 만족하는 기존 공용 modal primitive가 구현 시점에 존재하면 재사용할 수 있다.

### Known Traps

- selected Profile/Author ID 비교를 server 권한 판정의 대체물로 사용하면 안 된다. client 비교는 item 노출만 결정하고 mutation은 항상 resolver/Core 권한 검증을 통과해야 한다.
- 순수 Repost 화면에서 바깥 Repost ID를 More 삭제 mutation에 전달하면 Repost 취소와 Author Post 삭제 의미가 섞인다.
- server 성공 전에 record나 edge를 제거하면 실패·취소에서 cache를 정확히 복구하기 어렵다.
- actor environment 전환 뒤 이전 요청 callback이 현재 dialog/toast 또는 새 Store를 갱신하면 Profile별 격리가 깨진다.
- Relay record만 제거하고 비관리 connection edge, reply thread entry 또는 pure Repost의 Source reference를 방치하면 null fragment crash나 빈 Post row가 남을 수 있다.
- menu dismiss focus와 dialog initial focus를 같은 tick에 경쟁시키면 Web keyboard 사용자가 trigger로 튕길 수 있다.

## Risks / Trade-offs

- [여러 목록 shape의 cache 정리가 누락될 수 있음] → Home·Profile·상세 thread와 pure Repost Source를 각각 Relay payload test로 재현하고, 결과 기준으로 updater·reader를 함께 보완한다.
- [More child가 아직 완료되지 않은 PROD-432 링크 복사와 같은 surface를 수정함] → item 배열과 ActionMenu boundary를 확장 가능하게 유지하되 링크 복사를 미리 구현하지 않고, `삭제`가 존재할 때만 현재 trigger를 표시한다.
- [확인 modal을 feature-local로 두면 후속 destructive action에서 중복될 수 있음] → 현재 단일 use case에는 최소 구현을 유지하고 실제 두 번째 소비자가 생길 때 공용화한다.
- [Native 접근성 runtime은 Web 자동화로 증명할 수 없음] → universal component/Storybook test와 플랫폼별 semantics를 검증하고 VoiceOver·TalkBack 실기기 확인 여부를 별도 기록한다.

## Migration Plan

1. 기존 API resolver와 integration evidence를 재검증한다.
2. ActionMenu destructive item 표현과 More 삭제 child·확인 UI를 추가한다.
3. 목록·상세 surface에 target fragment와 오류 callback을 연결하고 server-success cache update를 구현한다.
4. Relay artifact, component/Storybook/API integration, typecheck·lint와 Web runtime을 검증한다.
5. 문제가 발생하면 client More 연결과 cache updater를 되돌린다. Core/DB/API schema와 migration을 바꾸지 않으므로 server rollback이나 data migration은 필요하지 않다.

## Open Questions

없음.
