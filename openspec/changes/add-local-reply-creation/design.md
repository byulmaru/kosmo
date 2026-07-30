## Context

`origin/main`에는 Post table의 nullable Reply Parent self-reference, `createPost(replyParentId?)` API, Reply thread와 Notification 기반이 병합되어 있다. 클라이언트의 기존 composer와 actual 목록·상세 Action Bar surface는 아직 Reply 작성 맥락, controlled `expanded`와 성공 결과 반영 경계를 연결하지 않았다.

PROD-424 backend, PROD-425 UI/thread, PROD-426 Notification/inbox는 하나의 Local Reply 사용자 흐름을 구성하고, 후행 PROD-423은 전체 통합 검증과 OpenSpec 동기화·archive를 수행한다. Reply 조상·하위 조회와 thread rendering은 `add-post-replies`/PROD-422, 공통 Notification projection·connection·Read·badge는 `add-in-app-notifications`의 선행 기반이다.

## Goals / Non-Goals

**Goals:**

- 기존 Plain Text Post mutation을 nullable Reply Parent 입력으로 확장하고 Parent 권한·Content 검증과 Reply 저장을 원자적으로 수행한다.
- 목록에서는 폭과 platform에 맞는 modal·전체 화면 surface로, 상세에서는 현재 thread의 inline surface로 기존 composer를 Reply 맥락에 재사용한다. 성공 시 현재 화면을 유지한 채 결과 Reply를 열 수 있는 feedback을 제공하고, 상세의 현재 query 범위에 포함되는 결과만 기존 thread 정렬에 따라 반영한다.
- Reply Notification을 기존 Notification projection·GraphQL·inbox·Read·badge 흐름에 수직적으로 추가한다.
- backend, UI, Notification 각 slice를 독립적으로 검증하고 PROD-423에서 전체 flow와 archive gate를 검증한다.

**Non-Goals:**

- Content Warning, Media/Sensitive Media, Mentioned Profile recipient·Mentioned Profiles/DIRECT 작성·조회
- Reply Parent와 Repost Source를 동시에 입력하는 Reply+Quote 작성
- ActivityPub Reply, Reply 외 Action Bar의 최종 action 조합·guest 인증 위임, retry/outbox/backfill, Reply Tombstone 후 동기 Notification cleanup
- `add-post-replies`의 Reply 조상·하위 GraphQL 계약과 thread rendering, `add-in-app-notifications`의 공통 inbox 기반을 다시 설계하는 작업

## Implementation Guidance

### Current Constraints

- PROD-424 구현은 API의 Parent 입력·viewer visibility 검증과 core write를 같은 caller transaction에 연결하며, 승인된 OpenSpec과의 독립 대조가 남아 있다.
- Parent visibility 검증과 core write가 서로 다른 connection/transaction에서 수행되면 검증 후 상태 변경 또는 부분 저장 경계가 생길 수 있다.
- `PostComposer` 성공 처리는 현재 본문 초기화에 초점이 있고 Parent, callback, context generation과 surface lifecycle 입력이 없다. `PostDetailThread_replyDescendants` connection은 선행 `add-post-replies` 구현이 제공한다.
- Notification kind, source predicate, concrete Node loader, connection/count/Read 쿼리와 client item이 Follow 구조에 결합되어 있어, Reply branch를 item 표시만으로 추가하면 hidden item이 page limit·count·Node·Read 간에 다르게 보일 수 있다.
- PROD-273은 실제 Mute·Block 정책 capability가 연결되기 전 Notification 생성 정책을 기본 allow로 정의한다. PROD-426은 아직 구현되지 않은 Profile Mute·Block·Domain Block·Domain Block Instance, Notification scope Word·Hashtag Mute와 Root Post thread Notification Mute capability 및 Reply source 연동을 구현하지 않는다.
- Relay generated artifact는 commit하지 않으며, selected Profile 전환은 Environment/Store 재생성을 통해 cache를 격리한다.

### Recommended Approach

1. PROD-424에서 `CreatePostInput`에 nullable `replyParentId: ID`를 추가하고 concrete `Post` global ID를 decode한다. 요청 Profile 기준 Parent visibility/eligibility·Content를 검증한 같은 transaction 내에서 기존 core Reply 저장 경계를 호출하고 기존 `CreatePostPayload.post`를 반환한다.
2. PROD-425에서 기존 `PostComposer`에 optional Parent ID와 성공 callback을 추가하고 selected Profile·Relay Environment·Parent별 draft·pending·error와 늦은 completion을 격리한다. 목록 surface는 Web `>= compact`에서 600px modal, Web `< compact`와 Native에서 전체 화면 composer를 열고, 상세 thread는 현재·조상·하위 행의 Reply를 하나의 active Parent로 제어해 해당 행에 inline으로 펼친다. display Post와 Action Bar target을 분리해 순수 Repost의 Repost action은 Source target을 유지하면서 Reply eligibility는 바깥 contentless Repost에서 disabled로 전달한다. selected Profile이 없는 guest에는 PROD-425 Reply config를 새로 노출하지 않고 최종 인증 위임은 PROD-432에 남긴다. 성공 시 surface를 닫고 focus를 복원한 뒤 결과 Reply로 이동하는 `보기` action을 가진 약 3초의 transient snackbar를 표시하되 자동 이동하지 않는다. 상세 route는 성공 payload callback에서 현재 query의 제한된 targeted refetch를 시작하고 전역 Post 목록 membership이나 다른 actor Store를 추측하지 않는다.
3. PROD-426에서 Reply source에서 Recipient·Related Post·Related Profile을 파생하는 멱등 Notification 저장 경계를 추가한다. Reply commit 후 같은 request에서 이 경계를 await/catch하여 source transaction과 격리한다.
4. Notification visibility predicate를 kind별 source relation에 따라 SQL에서 구성하고 page limit 전에 적용한다. Reply branch는 source PK에서 시작하는 nested `EXISTS`로 Parent Author/Recipient mapping과 Reply Author visibility를 확인하며 Parent lifecycle predicate는 두지 않는다. concrete `ReplyNotification` Node의 `post`/`profile` source hydration은 request-scoped `ctx.loader`로 batch하고, mixed connection/count/Read가 동일 predicate를 사용하게 한 뒤 client의 discriminated item branch를 결과 Reply 이동과 기존 Best Effort Read/cache 경계에 연결한다.
5. PROD-423에서 Post 상세 Reply 작성 → thread 반영 → Parent Author inbox/count → item 읽음/결과 Reply 이동을 통합 검증한다. 세 자식 계약과 선행 change의 task·delta spec이 모두 맞을 때만 archive한다.

### Allowed Alternatives

- 상세 thread 반영은 현재 route query의 fetch key를 갱신하는 제한된 targeted refetch를 사용한다. fetch policy와 pending presentation은 기존 route 관례 안에서 조정할 수 있지만 Relay connection edge·cursor나 전역 목록 membership을 합성하는 updater로 대체하지 않는다.
- 새 Reply가 조상 행의 형제 분기이거나 현재 pagination 범위 밖이면 targeted refetch 뒤에도 현재 thread에 나타나지 않을 수 있다. 이 경우 성공 snackbar가 표시되는 동안 `보기` action으로 결과 Reply에 접근할 수 있지만 snackbar를 지속성 navigation으로 취급하지 않으며, 이를 이유로 자동 이동하거나 thread 정렬·membership을 합성하지 않는다.
- Reply Notification의 kind별 visible SQL은 공통 base predicate와 kind branch를 조합하거나 같은 최종 predicate를 만드는 kind registry로 구성할 수 있다. kind별 메모리 병합으로 pagination 후 filtering하는 방식은 허용하지 않는다.

### Known Traps

- Parent ID를 UUID 문자열로 직접 받아 concrete GraphQL type 검증을 우회하지 않는다.
- Parent visibility를 검증하지 않거나 요청 Account/selected Profile을 viewer로 삼지 않고, 행동 주체 Profile을 viewer로 사용한다.
- Reply에 Parent Visibility를 강제하지 않고, `repostSourceId`를 작성 입력에 추가하지 않는다.
- Content 없는 Repost의 disabled action에 callback을 남겨 composer 진입이 가능하게 만들지 않는다.
- 순수 Repost의 direct Source를 Action Bar target으로 사용하더라도 바깥 display Post identity를 잃고 Reply eligibility를 Source Content에서 다시 계산하지 않는다.
- 상세 thread에서 재사용되는 `PostListItem`이 목록 폭만 보고 modal·전체 화면 surface를 열게 하지 않고, thread owner가 inline surface mode와 하나의 active Parent를 명시적으로 공급한다.
- 기존 `ModalSheet`의 420px geometry와 단순 close lifecycle을 600px Reply modal 계약으로 간주하지 않는다.
- Notification을 Reply transaction/savepoint에 넣거나 fire-and-forget으로 호출하지 않는다.
- client에서 hidden Notification을 사후 filtering해 서버 connection·count·Node·Read의 불일치를 감추지 않는다.

## Risks / Trade-offs

- [선행 thread/Notification change가 merge되기 전에 UI 또는 inbox slice를 구현하면 중복 ownership과 재작업이 생김] → PROD-425는 PROD-422, PROD-426은 기존 Notification 기반을 dependency gate로 유지하고 merge된 public contract에 맞춰 구현한다.
- [Notification이 Best Effort이므로 저장 실패 시 일부 Reply 알림이 누락될 수 있음] → Reply 성공을 우선하고 retry/outbox는 제외하되 실패 격리를 검증한다.
- [mixed Notification kind의 SQL predicate가 복잡해짐] → kind별 source 정합성을 공통 visible contract에서 조합하고 connection·count·Node·Read 통합 테스트로 드리프트를 막는다.
- [mutation 성공 후 targeted refetch를 사용하면 추가 network request가 생김] → 현재 상세 query의 fetch key만 갱신하고, connection edge·cursor 또는 전역 목록 membership을 합성하지 않는다.
- [현재 query 범위 밖의 새 Reply가 즉시 인라인 표시되지 않으면 성공 여부가 모호해질 수 있음] → 성공 snackbar와 결과 Reply `보기` action을 항상 제공하되 사용자의 현재 읽기 문맥을 보존한다.

## Migration Plan

1. additive GraphQL input·Reply 생성 경계와 테스트를 배포한다. 기존 `replyParentId` 생략 호출은 일반 Post 작성으로 계속 동작한다.
2. 선행 Reply thread 기반을 확인한 뒤 composer·action·thread cache 통합을 배포한다.
3. 기존 Notification 기반에 Reply kind, source predicate, API와 client item을 additive로 배포한다. schema enum migration이 필요하면 expand 단계로 먼저 반영한다.
4. 롤백 시 client/UI 통합과 Reply Notification branch를 역순으로 제거해도 기존 Reply Post 및 Follow Notification 데이터는 유지된다. additive input과 enum 값의 스토리지 contract 제거는 별도 contract 단계 없이 즉시 수행하지 않는다.

## Open Questions

없음.
