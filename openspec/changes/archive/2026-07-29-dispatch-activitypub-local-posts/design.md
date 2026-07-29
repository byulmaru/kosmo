## Context

PROD-494는 Local content Post를 Author Local Instance의 canonical Note로 투영하고 Reply Parent가 있으면 같은
표현에 `inReplyTo`를 포함한다. 현재 PROD-497 브랜치는 이 일반 projection 위에 Reply 전용 Create/Delete
helper를 추가했지만, helper가 Parent actor·inbox 조회와 `sendActivity()`까지 직접 수행해 Root Post delivery와
공통 followers fanout을 제공하지 못한다.

현재 federation은 MessageQueue 없이 remote HTTP를 직접 호출한다. core `createPost`와 `deletePost`는 optional
caller transaction 계약을 유지하며, top-level 호출에서 transaction 단계가 반환된 뒤 delivery를 await하고
실패를 committed 결과와 격리할 수 있다. caller-owned transaction에서는 committed-read projection이
uncommitted state를 보지 못해 delivery가 누락될 수 있고, rollback될 Activity를 먼저 보내지 않는 대신 이
누락을 PROD-448 전까지 수용한다.

## Goals / Non-Goals

**Goals:**

- direct Profile과 followers target을 같은 공통 recipient dispatcher에서 처리한다.
- actor/inbox eligibility와 실제 Fedify delivery를 activity별 lifecycle에서 제거한다.
- Root Post와 Reply가 PROD-494 projection을 사용하는 같은 Create/Delete lifecycle을 갖게 한다.
- Author Local Instance identity, stable activity identity·ordering과 post-commit failure isolation을 유지한다.
- 기존 Reply 전용 capability와 implementation 경계를 제거한다.

**Non-Goals:**

- Repost·Reaction·Follow·Mention을 이번 change에서 dispatcher로 migration
- transactional outbox, NATS, Fedify MessageQueue, worker, retry/history와 delivery status
- Update(Note), Direct/Mentioned Profiles delivery, ActivityPub Tombstone endpoint
- secondary Local Instance origin의 Actor·Note HTTP routing과 역참조(PROD-376)
- followers collection의 외부 공개 정책 또는 목록 API
- DB schema와 GraphQL payload 변경

## Implementation Guidance

### Current Constraints

- `projectLocalPostNote()`는 Active content Post만 full Note로 투영하므로 Create에는 재사용할 수 있지만 Tombstone
  Delete에는 별도의 최소 identity·audience source가 필요하다.
- 발신 actor key와 Note identity는 deployment configured origin이 아니라 Author Profile의 Local Instance에서
  파생해야 한다. 현재 Reply 전용 origin-free federation은 이름과 데이터 계약을 일반 outbound 경계로 바꿔야 한다.
- configured Local Instance가 아닌 Author origin의 outbound context는 해당 Instance key로 Activity를 구성·서명할
  수 있지만, 그 origin의 Actor·Note HTTP routing과 역참조는 PROD-376이 소유한다. PROD-512에서 production
  federation host routing을 함께 변경하지 않는다.
- 기존 Repost delivery의 follower 조회를 그대로 공통 dispatcher에 합치면 PROD-534 sibling 범위까지 함께
  구현하게 된다.
- Fedify special `"followers"` target만 사용하면 direct Parent author와 deduplication을 같은 경계에서 다루기
  어렵고, 외부 followers collection 공개 여부와 내부 expansion 책임이 섞일 수 있다.
- Reply Notification은 DB projection이며 Local Post Activity delivery와 별개다. caller transaction에 참여하는
  현재 동작을 dispatcher migration과 결합하면 안 된다.

### Recommended Approach

Fedify package에 activity-agnostic outbound dispatcher를 둔다. caller는 Author Profile·Local Instance identity,
이미 구성된 Activity, ordering key와 direct Profile/followers target만 넘긴다. dispatcher는 target을 현재 저장
관계에서 조회해 usable `Recipient`로 변환하고 actor URI로 deduplicate한 뒤 한 번의 `sendActivity()` 경계로
전달한다. public followers collection route를 열지 않고 내부 DB expansion을 사용한다.

Local Post integration은 기존 Note projection을 Create object로 재사용하고, Create activity audience도 Note의
`to`/`cc`를 그대로 사용한다. Delete는 Tombstone Post에서 Author Local Instance, visibility, Reply Parent와
canonical Note URI를 읽어 같은 audience와 targets를 복원한다. activity ID는 Note URI의 kind fragment,
ordering key는 fragment 없는 Note URI를 사용해 별도 activity row 없이 반복 호출을 안정화한다.

Target 의미는 Local Post integration에서 결정한다. 지원되는 모든 visibility는 Author followers를 포함하고,
Public/Unlisted remote Reply만 Parent author Profile direct target을 추가한다. dispatcher는 Parent 관계나
visibility를 알지 않고 전달받은 target만 확장한다.

통합 core `createPost`는 처음 생성된 Local content Post, `deletePost`는 처음 Tombstone으로 전이된 Local content
Post에 대해 transaction 단계가 반환된 뒤 Fedify Local Post delivery를 호출한다. GraphQL resolver는 인증과
payload mapping만 유지한다. delivery 오류는 Post identity와 함께 기록하고 committed result를 그대로 반환한다.
Reply Notification은 생성 transaction 안에서 기존 Reply 조건으로 계속 처리한다.

### Allowed Alternatives

- dispatcher 내부에서 followers expansion을 Fedify followers dispatcher 등록으로 구현할 수 있다. 다만 외부
  collection 공개를 추가하지 않고 direct target과 같은 eligibility·deduplication 결과를 제공해야 한다.
- activity ID를 별도 stable path로 구성할 수 있다. DB schema나 public activity endpoint 없이 같은 Post와 kind의
  반복 호출 identity 및 ordering 요구를 만족한다는 검증이 필요하다.

### Known Traps

- Reply 전용 delivery helper를 이름만 일반화하고 Parent actor/inbox 조회를 Local Post builder에 남기지 않는다.
- `inReplyTo` URI를 inbox endpoint 또는 recipient identity로 사용하지 않는다.
- Root Post delivery를 추가하면서 Content 없는 Repost까지 Create/Delete Note 대상으로 포함하지 않는다.
- Followers Only Reply의 Parent author를 direct target으로 추가해 visibility를 우회하지 않는다.
- invalid shared inbox 때문에 valid personal inbox recipient까지 버리지 않는다.
- caller transaction 여부로 Local Post lifecycle 자체를 끄지 않는다. committed-read no-op은 현재 delivery 한계이지
  origin 또는 lifecycle 분기 신호가 아니다.
- fire-and-forget Promise로 변경해 오류 관측과 process lifecycle을 불명확하게 만들지 않는다.
- PROD-448의 future outbox payload나 callback port를 이번 dispatcher API에 미리 추가하지 않는다.

## Risks / Trade-offs

- [Root Post까지 direct delivery를 await해 mutation latency가 증가] → transaction 뒤 실행하고 PROD-448 전까지
  현재 direct-delivery 계약을 명시적으로 유지한다.
- [현재 관계에서 Delete targets를 계산해 과거 recipient가 Delete를 받지 못함] → delivery history가 없는 현재
  제한으로 문서화하고 durable history를 이 change에 추가하지 않는다.
- [secondary Local Instance origin의 Actor·Note를 원격이 역참조하지 못할 수 있음] → outbound identity는 Author
  Instance에서 안정적으로 파생하되 production HTTP host routing은 기존 PROD-376 후속 범위로 유지한다.
- [여러 target이 같은 shared inbox로 수렴] → actor URI deduplication과 Fedify shared-inbox preference를 사용하고
  exactly-once remote side effect를 약속하지 않는다.
- [기존 PROD-497 PR의 구현 일부가 새 경계와 충돌] → Note projection, activity identity와 core failure isolation만
  재사용하고 Reply 전용 query/helper/spec은 제거한다.

## Migration Plan

1. 새 `PROD-512` 브랜치에서 이 OpenSpec과 공통 dispatcher를 구현한다.
2. 기존 PROD-497 구현에서 일반화 가능한 Note/origin/activity identity와 lifecycle 검증만 옮기고 Reply 전용
   recipient query와 helper를 제거한다.
3. Root Post·Reply Create/Delete와 dispatcher target/eligibility/deduplication을 통합 검증한다.
4. active `activitypub-local-reply-delivery` capability를 제거하고 두 새 capability로 동기화한다.
5. PR #385는 superseded 사유를 기록하고 닫은 뒤 PROD-512 브랜치로 새 PR을 연다.

DB migration은 없다. rollback은 새 core delivery wiring과 dispatcher를 제거하면 기존 Local Post 저장·조회
동작으로 돌아가며 저장 데이터 변환은 필요 없다.

## Open Questions

없음.
