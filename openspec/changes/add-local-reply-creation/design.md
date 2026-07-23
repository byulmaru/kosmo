## Context

`origin/main` 기준으로 Post table의 nullable Reply Parent self-reference와 core `createPost(replyParentId?)` 저장·rollback 기반은 존재한다. 반면 GraphQL `CreatePostInput`은 `bodyText`와 `visibility`만 받고, 클라이언트 composer와 Post 상세는 Reply 작성 맥락을 모르며, Notification 수직 경계는 Follow kind를 중심으로 구성되어 있다.

PROD-423은 `add-local-reply-creation` 공유 owner로서 PROD-424 backend, PROD-425 UI/thread, PROD-426 Notification/inbox를 하나의 사용자 흐름으로 통합한다. Reply 조상·하위 조회와 thread rendering은 `add-post-replies`/PROD-422, 공통 Notification projection·connection·Read·badge는 `add-in-app-notifications`의 선행 기반이다.

## Goals / Non-Goals

**Goals:**

- 기존 Plain Text Post mutation을 nullable Reply Parent 입력으로 확장하고 Parent 권한·Content 검증과 Reply 저장을 원자적으로 수행한다.
- Post 상세에서 기존 composer를 Reply 맥락으로 재사용하고 성공 결과를 현재 thread cache에 반영한다.
- Reply Notification을 기존 Notification projection·GraphQL·inbox·Read·badge 흐름에 수직적으로 추가한다.
- backend, UI, Notification 각 slice를 독립적으로 검증하고 PROD-423에서 전체 flow와 archive gate를 검증한다.

**Non-Goals:**

- Content Warning, Media/Sensitive Media, Mentioned Profile recipient·Mentioned Profiles/DIRECT 작성·조회
- Reply Parent와 Repost Source를 동시에 입력하는 Reply+Quote 작성
- ActivityPub Reply, Action Bar 전체 surface rollout, retry/outbox/backfill, Reply Tombstone 후 동기 Notification cleanup
- `add-post-replies`의 Reply 조상·하위 GraphQL 계약과 thread rendering, `add-in-app-notifications`의 공통 inbox 기반을 다시 설계하는 작업

## Implementation Guidance

### Current Constraints

- `packages/core/services/post.ts`는 Reply Parent를 저장할 수 있지만, API의 `apps/api/src/graphql/resolvers/post/mutation/create.ts`는 Reply Parent를 받지 않고 Parent의 viewer visibility를 검증하지 않는다.
- Parent visibility 검증과 core write가 서로 다른 connection/transaction에서 수행되면 검증 후 상태 변경 또는 부분 저장 경계가 생길 수 있다.
- `PostComposer` 성공 처리는 현재 본문 초기화에 초점이 있고, thread connection의 공개 shape은 선행 `add-post-replies` 구현이 제공해야 한다.
- Notification kind, source predicate, concrete Node loader, connection/count/Read 쿼리와 client item이 Follow 구조에 결합되어 있어, Reply branch를 item 표시만으로 추가하면 hidden item이 page limit·count·Node·Read 간에 다르게 보일 수 있다.
- Relay generated artifact는 commit하지 않으며, selected Profile 전환은 Environment/Store 재생성을 통해 cache를 격리한다.

### Recommended Approach

1. PROD-424에서 `CreatePostInput`에 nullable `replyParentId: ID`를 추가하고 concrete `Post` global ID를 decode한다. 요청 Profile 기준 Parent visibility/eligibility·Content를 검증한 같은 transaction 내에서 기존 core Reply 저장 경계를 호출하고 기존 `CreatePostPayload.post`를 반환한다.
2. PROD-425에서 선행 thread API/UI가 merge된 뒤 route가 thread query와 mutation connection context를 소유하게 한다. `PostComposer`에 optional Parent context를 주입하고, 성공 payload를 현재 descendant connection에 정규화·반영하되 전역 Post 목록 membership을 추측하지 않는다.
3. PROD-426에서 Reply source에서 Recipient·Related Post·Related Profile을 파생하는 멱등 Notification 저장 경계를 추가한다. Reply commit 후 같은 request에서 이 경계를 await/catch하여 source transaction과 격리한다.
4. Notification visibility predicate를 kind별 source relation에 따라 SQL에서 구성하고 page limit 전에 적용한다. concrete `ReplyNotification` Node, mixed connection/count/Read가 동일 predicate를 사용하게 한 뒤 client의 discriminated item branch를 결과 Reply 이동과 기존 Best Effort Read/cache 경계에 연결한다.
5. PROD-423에서 Post 상세 Reply 작성 → thread 반영 → Parent Author inbox/count → item 읽음/결과 Reply 이동을 통합 검증한다. 세 자식 계약과 선행 change의 task·delta spec이 모두 맞을 때만 archive한다.

### Allowed Alternatives

- thread 반영은 선행 Reply connection이 제공하는 공식 Relay connection updater 또는 현재 Post 상세의 제한된 targeted refetch를 사용할 수 있다. 두 방식 모두 성공 직후 현재 thread에 결과가 보여야 하고 selected Profile Store 밖을 갱신하면 안 된다.
- Reply Notification의 kind별 visible SQL은 공통 base predicate와 kind branch를 조합하거나 같은 최종 predicate를 만드는 kind registry로 구성할 수 있다. kind별 메모리 병합으로 pagination 후 filtering하는 방식은 허용하지 않는다.

### Known Traps

- Parent ID를 UUID 문자열로 직접 받아 concrete GraphQL type 검증을 우회하지 않는다.
- Parent visibility를 검증하지 않거나 요청 Account/selected Profile을 viewer로 삼지 않고, 행동 주체 Profile을 viewer로 사용한다.
- Reply에 Parent Visibility를 강제하지 않고, `repostSourceId`를 작성 입력에 추가하지 않는다.
- Content 없는 Repost의 disabled action에 callback을 남겨 composer 진입이 가능하게 만들지 않는다.
- Notification을 Reply transaction/savepoint에 넣거나 fire-and-forget으로 호출하지 않는다.
- client에서 hidden Notification을 사후 filtering해 서버 connection·count·Node·Read의 불일치를 감추지 않는다.

## Risks / Trade-offs

- [선행 thread/Notification change가 merge되기 전에 UI 또는 inbox slice를 구현하면 중복 ownership과 재작업이 생김] → PROD-425는 PROD-422, PROD-426은 기존 Notification 기반을 dependency gate로 유지하고 merge된 public contract에 맞춰 구현한다.
- [Notification이 Best Effort이므로 저장 실패 시 일부 Reply 알림이 누락될 수 있음] → Reply 성공을 우선하고 retry/outbox는 제외하되, 실패 격리 테스트와 관측 가능한 오류 기록을 유지한다.
- [mixed Notification kind의 SQL predicate가 복잡해짐] → kind별 source 정합성을 공통 visible contract에서 조합하고 connection·count·Node·Read 통합 테스트로 드리프트를 막는다.
- [mutation 성공 후 targeted refetch를 사용하면 추가 network request가 생김] → 선행 connection의 정렬·cursor 계약을 안전하게 갱신할 updater가 있으면 우선하고, 없을 때만 현재 상세에 제한한다.

## Migration Plan

1. additive GraphQL input·Reply 생성 경계와 테스트를 배포한다. 기존 `replyParentId` 생략 호출은 일반 Post 작성으로 계속 동작한다.
2. 선행 Reply thread 기반을 확인한 뒤 composer·action·thread cache 통합을 배포한다.
3. 기존 Notification 기반에 Reply kind, source predicate, API와 client item을 additive로 배포한다. schema enum migration이 필요하면 expand 단계로 먼저 반영한다.
4. 롤백 시 client/UI 통합과 Reply Notification branch를 역순으로 제거해도 기존 Reply Post 및 Follow Notification 데이터는 유지된다. additive input과 enum 값의 스토리지 contract 제거는 별도 contract 단계 없이 즉시 수행하지 않는다.

## Open Questions

없음.
