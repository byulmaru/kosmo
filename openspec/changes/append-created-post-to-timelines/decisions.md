## Context

이 기록은 PROD-641의 createPost 호출자 로컬 즉시 반영 범위, createPost가 도달 가능한 Post 구조와 selected Profile actor Store 경계, 그리고 현재 API·Relay 제약을 반영한다. 구현 전에는 아래 Authority / Provenance를 OpenSpec과 독립적으로 다시 확인한다.

## Decision Records

### createPost는 검증된 committed Post에서 Home·Profile edge를 투영한다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-641
- Status: Active
- Context / Problem: 현재 GraphQL `createPost` input이 도달시키는 Post 형태는 Original·Reply다. PROD-641의 조건부 surface rule은 committed Post의 relation shape를 기준으로 하므로, 이 action이 Quote 또는 Reply+Quote shape를 반환하는 경우에도 Home은 Home 후보 Reply를 포함하고 Profile은 Reply Parent가 있는 모든 Post를 제외한다. mutation 뒤 다시 Post List 정책을 DB 조회하면 이미 검증한 결과를 재평가하고 성공 경로에 불필요한 읽기 실패 표면을 만든다.
- Decision Outcome: `createPost` 성공 payload는 transaction이 반환한 canonical Post에서 Home edge를 항상 `{ cursor: post.id, node: post }`로 투영한다. Profile edge는 committed `post.replyParentId == null`일 때만 같은 shape로 투영하고, 그 밖에는 nullable `null`을 반환한다. 이 투영은 post-commit 정책 DB read를 수행하지 않는다. 서버는 committed Post invariant와 payload shape의 authority를 보유하며 클라이언트는 nullable edge의 존재만 소비하고 정책을 재계산하지 않는다.
- Alternatives Considered: mutation 뒤 Home/Profile 후보·Visibility·Control predicate를 다시 조회하는 방식은 createPost의 검증된 committed 결과를 재평가하고 읽기 실패를 성공 후 오류로 바꾼다. 클라이언트가 Original·Quote·Reply·Reply+Quote의 관계를 판정하거나 cursor를 합성하는 방식은 서버 authority와 canonical identity를 복제한다.
- Consequences: Home/Profile query는 조회 시점의 Post List Policy를 계속 적용하지만 mutation payload는 별도 policy projection 없이 committed invariant를 반환한다. payload edge가 `null`이면 클라이언트는 해당 surface를 변경하지 않는다. Reply Parent가 있는 Post는 Quote 여부와 관계없이 Profile edge가 `null`이다.
- Confirmation / Follow-up: 현재 API resolver/schema와 integration fixture에서 Original·Reply·Remote selected Profile의 Post/cursor identity, Reply Parent가 있는 Post의 Profile `null`, post-commit DB read 부재를 검증한다. Quote·Reply+Quote는 같은 `replyParentId` invariant에 따른 조건부 mapping으로 확인하며 해당 fixture가 있다고 주장하지 않는다.

### CreatePostPayload에 surface별 nullable Post edge를 추가한다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, PROD-641
- Status: Active
- Context / Problem: 기존 `CreatePostPayload.post`만으로는 connection cursor와 서버가 결정한 surface 결과를 표현할 수 없다. client-only edge를 만들면 pagination cursor와 membership을 추측하게 된다.
- Decision Outcome: 기존 `post` field를 유지하면서 additive nullable `homeTimelineEdge`와 `profilePostsEdge`를 같은 `PostConnection` edge type으로 제공한다. 각 edge는 생성 Post의 canonical Node identity와 해당 server connection의 Post ID cursor를 재사용한다.
- Alternatives Considered: 하나의 edge와 membership enum/list는 Relay operation에서 surface별 edge를 독립 선택·정규화하기 어렵다. boolean eligibility와 client-created edge는 cursor를 클라이언트에 맡긴다. mutation 성공 후 Home/Profile refetch는 제외 범위인 광범위한 재조회와 latency를 추가한다.
- Consequences: API schema snapshot과 Relay source operation이 additive하게 바뀐다. 구버전 client는 새 field를 선택하지 않아 계속 동작한다. 두 field는 nullable이므로 Reply의 Profile 부재를 명시할 수 있다.
- Confirmation / Follow-up: schema test에서 field type/nullability를, resolver test에서 node/cursor identity와 surface 판정을 검증한다.

### 요청 actor의 managed connection에 ordered deduplicating updater를 사용한다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/post-list.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-641
- Status: Active
- Context / Problem: Home·Profile source fragment는 현재 managed connection이 아니며, 최신순 목록에 literal `@appendEdge`를 쓰면 순서가 깨진다. `@prependEdge`만으로 같은 Node의 반복 payload가 edge 수준에서 반드시 deduplicate된다는 현재 증거도 없다.
- Decision Outcome: Home과 Profile에 parent가 다른 안정적인 managed connection identity를 부여하고, mutation을 commit한 요청 Environment 안에서만 좁은 Relay updater를 실행한다. updater는 server-returned edge의 `node.id`가 대상 connection에 없을 때만 첫 edge 앞에 삽입하며, connection이 로드되지 않았으면 아무 record도 합성하지 않는다.
- Alternatives Considered: `@appendEdge`는 최신순을 위반한다. `@prependEdge`는 duplicate completion에서도 단일 edge를 보장하는 runtime evidence가 없으므로 현재 선택하지 않는다. 전역 dedup registry는 Store가 이미 소유하는 identity를 중복 관리한다.
- Consequences: updater는 Home Query root와 작성자 Profile parent를 구분해야 한다. Node normalization 뒤에도 edge membership을 별도로 검사하며, 기존 edge 상대 순서와 cursor는 유지한다.
- Confirmation / Follow-up: loaded/unloaded connection, duplicate completion, existing same-node edge, Home/Profile 독립성, 최신순을 Relay Store 테스트로 검증한다.

### 늦은 결과는 이전 actor Store에만 적용하고 UI lifecycle과 분리한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-641
- Status: Active
- Context / Problem: 작성 중 selected Profile 전환은 새 Relay Environment와 Store를 만들며 route unmount도 Composer callback의 lifecycle을 끝낼 수 있다. completion 시점의 current actor나 route를 사용하면 이전 요청이 새 actor UI를 오염시킨다.
- Decision Outcome: payload normalization과 connection updater는 요청을 시작한 Environment에 귀속한다. Composer state, navigation, toast 같은 UI completion은 기존 mounted·generation·Environment guard를 통과할 때만 적용하며, 새 actor Store로 결과를 복사하지 않는다.
- Alternatives Considered: actor 전환 시 이전 mutation을 새 Store에 replay하면 요청 주체와 viewer-relative cache가 섞인다. 모든 늦은 성공을 버리면 요청 actor Store의 이미 로드된 목록도 불필요하게 stale해진다.
- Consequences: 이전 Store가 유지되는 동안에는 edge가 반영될 수 있지만 새 actor 화면은 변하지 않는다. 같은 actor의 이후 query는 server result로 수렴한다.
- Confirmation / Follow-up: actor A 요청 뒤 actor B 전환, same-actor route unmount, callback generation mismatch를 분리 검증한다.

### createPost 로컬 반영과 Subscription 책임을 분리한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: PROD-641, PROD-644
- Status: Active
- Context / Problem: 기존 frontend memory는 모든 새 Post membership을 미래 Subscription이 소유한다고 기록해 createPost 호출자 즉시 반영 계약과 맞지 않는다.
- Decision Outcome: PROD-641은 현재 actor가 호출한 createPost 성공 결과를 요청 Store에 즉시 반영하는 책임을 가진다. PROD-644는 다른 Profile·remote ingestion 등 다른 producer의 새 후보를 장기 실시간 전달하고 reconnect·resume·fan-out을 소유한다.
- Alternatives Considered: Subscription까지 기다리면 현재 사용자 문제를 유지한다. PROD-641에서 모든 producer를 다루면 인증·fan-out·resume 범위를 부당하게 확장한다.
- Consequences: `memory/frontend-react-native.md`를 이 경계로 갱신한다. 두 경로가 함께 존재할 때도 canonical Post identity와 duplicate-safe connection 계약을 공유해야 한다.
- Confirmation / Follow-up: 이번 구현은 Subscription transport를 추가하지 않고 createPost caller flow만 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
