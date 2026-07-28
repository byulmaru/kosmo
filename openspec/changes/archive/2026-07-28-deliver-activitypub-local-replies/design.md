## Context

PROD-494는 `packages/fedify`에 Local Post의 `/ap/note/{postId}` identity, Local Note projection, visibility audience,
signed fetch authorization과 Local/Remote Post URI resolver를 제공한다. Local Reply도 이 dispatcher에서 기존
`inReplyTo`를 포함한 Note로 역참조할 수 있지만, 현재 Local Post 생성·삭제 application flow는 activity를 remote
inbox로 전달하지 않는다.

Local Reply 생성의 가장 바깥 transaction은 GraphQL resolver가 Parent 접근을 검증하고 `createPost(..., tx)`를
호출하는 경계에 있다. 반면 `deletePost()`는 core action이 transaction을 직접 연다. 기존 Remote Follow은 domain
transaction이 끝난 뒤 Fedify delivery를 `await`하고, 실패를 catch/log해 committed result와 분리한다. 현재
federation에는 MessageQueue가 없으므로 `sendActivity()`는 remote HTTP 요청을 직접 수행한다.

## Goals / Non-Goals

**Goals:**

- Local Reply 생성과 삭제를 기존 Fedify delivery 경계에 연결한다.
- Local Note projection과 Post identity를 복제하지 않고 Create와 Delete에서 재사용한다.
- visibility, established Follow, remote Parent Author와 Instance 상태에서 recipient를 결정한다.
- 실제 outer transaction commit 뒤 delivery하고 실패와 committed application 결과를 격리한다.
- 반복 호출에 안정적인 activity identity와 Create/Delete ordering domain을 제공한다.

**Non-Goals:**

- transactional outbox, NATS, Fedify MessageQueue, worker, retry/history와 delivery status
- 과거 Create recipient snapshot 또는 이미 unfollow한 recipient에 대한 Delete 보정
- inbound Reply, Repost, Reaction, Mention, Media, Direct와 Tombstone object endpoint
- followers collection dispatcher 또는 ActivityPub outbox collection
- Post·Profile·Follow·ActivityPub Actor schema와 GraphQL payload 변경

## Implementation Guidance

### Current Constraints

- `createPost()`는 optional caller transaction에 합류한다. 이 함수 안에서 delivery를 호출하면 가장 바깥
  transaction이 아직 rollback될 수 있으므로 post-commit 계약을 보장하지 못한다.
- 현재 Local Note loader는 Active Post만 제공한다. Reply가 Tombstone이 된 뒤에는 dispatcher를 그대로 호출해
  Delete projection을 만들 수 없다.
- Create의 embedded Note를 별도로 다시 직렬화하면 object dispatcher의 content, summary, audience와 `inReplyTo`
  계약이 쉽게 달라진다.
- Fedify의 special `"followers"` recipient는 followers collection dispatcher가 필요하지만 현재 actor 계약은
  collection GET을 열지 않는다.
- Remote actor row에는 inbox가 nullable이고 같은 shared inbox를 여러 Profile이 공유할 수 있다. 전달 후보와
  실제 `Recipient` 구성, actor 중복과 shared inbox 묶음을 구분해야 한다.

### Recommended Approach

가장 바깥 application transaction을 소유하는 GraphQL resolver가 commit된 Post ID를 받은 뒤 Fedify package의
좁은 Reply delivery API를 호출하는 방식을 기본으로 한다. Create resolver는 기존 outer transaction이 끝난 뒤,
Delete resolver는 `deletePost()`가 반환된 뒤 호출한다. 두 호출은 각각 `await`하되 오류를 구조화해 기록하고 기존
payload를 반환한다.

Fedify package에서는 기존 Local Note 조회와 projection을 내부적으로 재사용 가능한 경계로 정리한다. Create는
commit된 Active Reply에서 object dispatcher와 동일한 Note를 만들고, Delete는 Tombstone row에 남아 있는 Author,
Visibility와 Reply Parent 관계에서 actor, canonical Note URI, audience와 recipient를 복원한다. Delete에는 Active
Note representation이나 새 Tombstone endpoint가 필요하지 않다.

Recipient는 delivery 시점의 저장 상태에서 한 번 조회한다. Author의 established remote follower와 필요하면 remote
Parent Author를 모으고, Active ActivityPub Instance, Active Profile, actor URI와 inbox가 있는 후보만 `Recipient`
배열로 만든다. actor URI로 중복을 제거하고 Fedify의 shared inbox 선호 옵션을 사용한다. 후보가 없으면
`sendActivity()`를 호출하지 않는다.

Activity ID는 canonical Note URI에서 Create와 Delete를 구분하는 안정적인 fragment로 파생하고 ordering key는
fragment 없는 Note URI를 사용한다. 이 방법은 별도 activity row나 공개 activity dispatcher 없이 같은 Post의
반복 delivery identity와 Create/Delete ordering domain을 유지한다.

### Allowed Alternatives

- core application action이 실제 outer transaction 전체를 직접 소유하도록 구조를 정리한 뒤 그 action의
  post-commit 구간에서 delivery를 orchestration할 수 있다. 다만 현재 Parent 접근 검증을 callback이나 protocol
  타입으로 core public contract에 주입해서는 안 되며, optional caller transaction 안에서 delivery해서도 안 된다.
- recipient를 한 번에 전달하거나 server별로 나누어 전달할 수 있다. 어느 방식이든 actor 중복 제거, shared inbox
  사용, 안정적인 activity identity, recipient별 Create/Delete ordering과 전체 failure isolation을 보존해야 한다.

### Known Traps

- `createPost(..., tx)` 또는 transaction callback 안에서 Fedify를 호출해 rollback될 state를 먼저 전달하지 않는다.
- delivery Promise를 await하지 않는 fire-and-forget으로 바꾸지 않는다. 실패 관측과 process 종료 동작이 더
  불명확해진다.
- Fedify의 자동 생성 activity ID를 사용하지 않는다. 같은 Reply 재호출이 다른 activity가 된다.
- Create 전용 Note serialization을 새로 만들거나 Delete를 위해 Active-only dispatcher 조건을 완화하지 않는다.
- followers collection dispatcher 없이 special `"followers"` recipient를 사용하지 않는다.
- Followers Only Reply를 follower가 아닌 remote Parent Author에게 전달하지 않는다.
- `UNRESPONSIVE` recipient를 durable pending delivery로 저장하거나 회복 뒤 자동 재전송하지 않는다.
- 한 remote actor의 inbox 누락 때문에 유효한 다른 recipient 전체를 projection 단계에서 실패시키지 않는다.
- PROD-448의 outbox·queue 구조를 현재 작업의 abstraction이나 test seam으로 미리 추가하지 않는다.

## Risks / Trade-offs

- [Remote HTTP가 느리면 mutation 응답이 지연됨] → 현재 직접 delivery 계약에 따라 await하되 transaction은 이미
  commit된 상태로 유지한다. 응답 경로 분리는 PROD-448이 소유한다.
- [Commit 뒤 process 종료 시 activity 유실] → 현재 제한을 문서와 테스트 경계에 남기고 outbox를 부분 구현하지
  않는다.
- [다중 recipient delivery가 일부 성공한 뒤 실패할 수 있음] → activity identity와 ordering key를 안정적으로
  유지해 재호출이 새 logical activity가 되지 않게 하고 committed 결과에는 영향을 주지 않는다.
- [삭제 시점 recipient가 생성 시점과 달라 과거 recipient에 Delete가 도달하지 않을 수 있음] → history가 없는
  현재 범위에서는 action 시점의 recipient만 사용하며 delivery history migration과 분리한다.
- [Tombstone Post에서 Note projection을 잘못 재사용할 수 있음] → Create의 full Note projection과 Delete의 identity·
  audience projection을 구분하고 각각 lifecycle matrix를 검증한다.

## Migration Plan

DB schema와 저장 데이터 migration은 없다. OpenSpec Gate 승인 뒤 Fedify projection/delivery와 API post-commit
wiring을 추가하고 package·API integration test를 먼저 통과시킨다. Rollback은 새 resolver wiring과 Fedify Reply
delivery 경계를 제거하면 기존 Local Reply 저장·조회·삭제 동작으로 돌아가며 저장 데이터 변환은 필요 없다.

## Open Questions

없음.
