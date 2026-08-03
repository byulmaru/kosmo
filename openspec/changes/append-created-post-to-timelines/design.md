## Context

현재 `PostComposer`의 `createPost` mutation은 `CreatePostPayload.post { id }`만 선택하고 updater나 refetch를 실행하지 않는다. Home은 `Query.homeTimeline(first: 20)`, Profile 화면은 `Profile.posts(first: 20)`의 raw edge를 `PostList`에 전달하며 두 source fragment 모두 아직 Relay `@connection` handle을 선언하지 않는다. 따라서 생성 Post Node가 normalized Store에 들어와도 이미 렌더링한 목록 membership은 바뀌지 않는다.

서버의 Home·Profile resolver는 모두 Post ID cursor와 최신순을 사용하며 조회 시점에는 기존 Post List Policy를 적용한다. 현재 GraphQL `createPost` input이 도달시키는 Post 형태는 Original·Reply다. 그러나 성공 payload는 post-commit DB projection read가 아니라 같은 transaction이 반환한 validated committed Post를 사용하며, PROD-641의 relation-shape mapping은 Quote·Reply+Quote shape가 반환되는 경우에도 적용된다. 따라서 Home edge는 모든 성공 결과에 있고, Profile edge는 `replyParentId == null`인 경우에만 있다. selected Profile이 바뀌면 `RelayActorProvider`가 새 Environment와 빈 Store를 만들고 기존 mutation action들은 요청 Environment와 현재 Environment를 비교해 늦은 UI callback을 버리는 관례를 사용한다.

PROD-641은 createPost 호출자가 만든 Post의 로컬 즉시 반영만 소유한다. 다른 producer의 Post를 전달하는 Subscription은 PROD-644 범위이며, 기존 Post List 후보·제어·최신순 정책을 바꾸지 않는다.

## Goals / Non-Goals

**Goals:**

- 서버가 검증된 committed Post invariant에서 Home·작성자 Profile canonical Post edge를 payload로 제공하고, 조회용 Post List Policy를 mutation 뒤 다시 DB 평가하지 않는다.
- 이미 로드된 Home·Profile 목록을 안정적인 Relay managed connection으로 식별한다.
- 요청 actor Store에만 server-derived edge를 최신순·중복 없이 반영한다.
- 현재 runtime 자동 검증은 Original·Reply와 Profile nullable edge, loaded/unloaded connection, duplicate completion 및 actor/route lifecycle을 다룬다. Quote·Reply+Quote는 동일 committed `replyParentId` 조건부 mapping으로 static 검증한다.

**Non-Goals:**

- GraphQL Subscription, server push 또는 다른 viewer의 Store 동기화
- Post List 후보·Control Decision·정렬·pagination 정책 변경
- mutation 성공 후 광범위한 query refetch 또는 새 route 자동 이동
- client-side Post List 정책 재구현, client-only cursor·Post·edge 합성
- DB schema/migration 또는 새 dependency

## Implementation Guidance

### Current Constraints

- `@appendEdge`는 최신순 connection의 끝에 삽입하므로 현재 정렬과 맞지 않는다. compiler directive를 쓰면 `@prependEdge`, explicit updater를 쓰면 첫 edge 앞 삽입이 필요하다.
- Home connection의 parent는 Query root이고 Profile connection의 parent는 Author Profile Node다. 같은 key나 parent identity로 두 surface를 취급하면 잘못된 목록을 갱신한다.
- 현재 목록 fragment는 managed connection이 아니므로 mutation에서 안정적인 connection record를 찾을 수 없다. pagination 인자를 identity에서 제외하는 안정적 handle을 먼저 선언해야 한다.
- normalized Post Node의 중복 제거와 connection edge의 중복 제거는 별개다. 동일 Node가 정규화되어도 retry 또는 duplicate completion이 두 edge reference를 남길 수 있다.
- mutation 성공 시점의 selected Profile이나 route를 현재 Provider에서 다시 읽으면 actor 전환 뒤 새 Store·UI를 오염시킬 수 있다. 요청 시작 시점의 Environment와 connection target을 유지해야 한다.
- generated Relay artifact는 commit하지 않는다. source GraphQL과 API schema를 맞춘 뒤 Relay compiler를 실행해 type과 directive 유효성을 확인해야 한다.

### Recommended Approach

1. `CreatePostPayload`에 nullable `homeTimelineEdge`와 `profilePostsEdge`를 additive하게 노출한다. 두 field는 기존 `PostConnection`과 같은 edge type, Post ID cursor와 생성 Post Node identity를 사용한다. 서버는 create transaction이 반환한 validated committed Post에서 Home edge를 항상 만들고, `replyParentId == null`일 때만 Profile edge를 만든다. 이 projection은 post-commit 후보·Visibility·Control DB read를 수행하지 않는다.
2. Home과 Profile source fragment에 surface별 안정적인 `@connection` handle을 선언한다. Home은 Query root와 actor Store로, Profile은 Author Profile Node와 actor Store로 이미 격리되므로 pagination 인자만 connection identity에서 제외한다.
3. Composer mutation은 두 edge field를 선택하고 요청 시작 시점의 Home·작성자 Profile connection target을 사용한다. 기본 경로는 Relay `ConnectionHandler` 기반의 좁은 updater다. 각 nullable response edge에 대해 대상 connection이 실제로 로드됐는지 확인하고, 동일 `node.id` edge가 없을 때만 첫 edge 앞에 server edge를 삽입한다.
4. updater는 없는 connection을 만들거나 cursor를 합성하지 않는다. Relay mutation이 commit된 Environment가 요청 actor Store를 소유하도록 두고, UI completion은 기존 mounted·generation·Environment guard를 유지해 새 actor나 unmount된 Composer 상태를 변경하지 않는다.
5. 현재 API 테스트는 두 edge의 nullability, Post/cursor identity, Original·Reply와 committed invariant projection을 검증한다. Quote·Reply+Quote mapping은 committed `replyParentId` invariant의 static verification gap으로 기록하며 현재 fixture가 있다고 주장하지 않는다. post-commit DB failure surface를 만들거나 테스트하지 않는다. 앱 Relay 테스트는 Home/Profile 각각 loaded·unloaded, 최신순, 같은 Node duplicate, GraphQL/network failure, actor A/B Store, route unmount를 검증한다. source schema 변경 뒤 Relay compiler, app check와 API schema/test를 함께 실행한다.
6. `memory/frontend-react-native.md`는 createPost 호출자 성공의 로컬 즉시 반영을 PROD-641이, 다른 producer의 장기 실시간 membership을 PROD-644 Subscription이 소유하도록 경계를 수정한다.

### Allowed Alternatives

- Relay compiler의 `@prependEdge`가 같은 Node의 반복 payload를 connection edge 수준에서 중복시키지 않는다는 runtime 테스트를 통과하고, Home·Profile별 actor-scoped connection ID를 정확히 공급할 수 있다면 explicit `ConnectionHandler` updater 대신 사용할 수 있다.
- 서버의 두 nullable edge field를 하나의 edge와 서버 projection으로 표현할 수 있다. 단, 클라이언트가 Post 관계·Visibility·mute/block을 해석하지 않아야 하고, canonical cursor·nullable Profile 판정·독립 GraphQL 선택 가능성·strict spec 시나리오를 모두 유지해야 한다.

### Known Traps

- 최신순 목록에 literal `@appendEdge`를 사용해 새 Post를 마지막에 배치하지 않는다.
- `CreatePostPayload.post`만으로 client-only `PostEdge`나 cursor를 만들지 않는다.
- 현재 Provider의 selected Profile을 completion 시점에 읽어 이전 요청 결과를 새 actor Store에 적용하지 않는다.
- Profile route가 Store에 로드돼 있다는 이유만으로 selected Profile이 아닌 다른 Target Profile의 connection을 갱신하지 않는다.
- nullable edge가 없는 surface를 관계 shape만 보고 클라이언트에서 보완하지 않는다.
- 같은 Post Node가 normalized됐다는 사실만으로 edge dedup이 끝났다고 가정하지 않는다.
- `@connection` filters에 `first` 같은 pagination 인자를 포함해 page마다 다른 connection identity를 만들지 않는다.

## Risks / Trade-offs

- [조회용 Post List 정책과 payload invariant projection의 의미가 혼동될 수 있음] → payload는 committed `Post`와 `replyParentId`만 사용하고, Home/Profile query는 기존 조회 policy를 계속 사용한다. 현재 API fixture는 Original·Reply를 검증하고 Quote·Reply+Quote는 동일 invariant의 static mapping gap으로 남긴다.
- [명시적 updater가 Relay 내부 shape에 결합될 수 있음] → 공개 `ConnectionHandler` API와 server-returned edge record만 사용하고 compiler/runtime 버전 21의 테스트로 고정한다.
- [중복 edge scan 비용] → 현재 첫 page 최대 20개에서 Node identity를 확인하고, correctness를 위해 전역 dedup registry는 도입하지 않는다.
- [이전 actor Store는 화면에서 분리된 뒤 곧 수거될 수 있음] → 요청 closure가 유지하는 Environment에만 적용하고 새 Store로 결과를 전달하지 않는다. 이후 같은 actor가 다시 열리면 정상 query 결과에 수렴한다.
- [additive payload field를 구버전 API가 모름] → API schema를 먼저 배포하거나 같은 release에서 API와 client를 원자적으로 검증한다. 기존 client는 새 field를 선택하지 않아 영향을 받지 않는다.

## Migration Plan

1. API에 additive payload edge field와 schema/test를 먼저 추가한다. edge projection은 transaction 결과만 사용하며 post-commit policy read를 추가하지 않는다.
2. Home·Profile managed connection과 Composer updater·Relay tests를 추가하고 compiler/check를 통과시킨다.
3. 앱 배포 전 기존 createPost 성공/실패, Home/Profile query와 actor switch 회귀를 통합 검증한다.
4. DB migration은 없다. rollback은 client connection updater와 handle 사용을 먼저 되돌린 뒤, 사용자가 없는 additive API field를 후속 제거할 수 있다. rollback 중 기존 refetch 전 지연 동작으로 돌아가지만 저장된 Post나 pagination data는 손실되지 않는다.

## Open Questions

없음.
