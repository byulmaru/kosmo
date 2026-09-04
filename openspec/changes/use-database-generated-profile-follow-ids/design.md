## Context

ProfileFollow와 ProfileFollowRequest의 `id` column은 이미 PostgreSQL `uuidv7()` default를 선언한다. 그러나 Follow pair Workflow는 transaction Activity 전에 Temporal `uuid4()` candidate를 만들고 Core insert에 전달해 이 default를 우회한다. candidate는 Activity commit 뒤 completion 응답 유실 시 현재 row를 이번 transition의 결과로 식별해 create effect를 재구성하기 위해 도입됐다.

PROD-892는 해당 희귀 failure window에서 committed 관계 상태는 보존하되 create effect 누락을 수용하고, UUID 생성 책임을 PostgreSQL default로 단일화한다. 기존 pair uniqueness, exact Request ID, Pending source bootstrap과 Unfollow의 exact deleted-source 복구는 별도 경계이므로 유지한다.

## Goals / Non-Goals

**Goals:**

- 신규 Follow와 Follow Request가 PostgreSQL `DEFAULT uuidv7()`으로 ID를 얻는다.
- 정상 transaction 결과와 create effect가 DB가 반환한 실제 source ID를 사용한다.
- completion-loss retry가 중복 row/effect를 만들지 않고 pair lifecycle을 현재 committed 상태로 수렴시킨다.
- 기존 Workflow history와 진행 중인 Pending run을 replay할 수 있다.

**Non-Goals:**

- completion-loss에서 누락된 Notification/Fedify create effect 복구
- UUID 생성 Activity, receipt, outbox, sweeper 또는 reconciliation 도입
- PROD-328/PR #665/#666, Unfollow 복구, DB schema/migration 또는 production rollout 변경

## Implementation Guidance

### Current Constraints

- Follow pair Workflow가 `FOLLOW`와 `APPROVE`/`ACCEPT`에서 candidate UUID를 Activity input에 넣는다.
- Core transaction helper는 optional explicit ID를 insert에 전달하고, command executor는 현재 row ID와 candidate가 같으면 이전 commit을 재구성한다.
- candidate만 제거하면 approve/accept completion-loss retry가 Request 부재와 기존 Follow를 `NOOP/PENDING`으로 처리해 terminal lifecycle이 막힐 수 있다.
- 기존 history replay에서는 Activity 호출 type과 순서를 유지해야 한다. Activity input payload 변경은 허용되지만 UUID 생성 Activity를 새로 삽입하면 새 command가 생긴다.

### Recommended Approach

Workflow의 `uuid4()` 호출과 candidate Activity input을 제거하고, Core insert가 pair 값만 전달해 column default를 사용하게 한다. 정상 commit은 `RETURNING` row의 ID를 그대로 result와 effect plan에 사용한다. duplicate retry는 `created: false`와 빈 create effect plan을 반환한다.

Approve/Accept retry에서 history의 `pendingRequestId`가 command의 exact `expectedRowId`와 같고 Request는 사라졌으며 같은 directed pair의 Follow가 존재하면, 이를 committed 관계 상태로 수렴시켜 `ESTABLISHED`로 종료한다. candidate가 없으므로 Request delete와 Follow create effects는 재구성하지 않는다. exact pending identity가 일치하지 않으면 기존 conservative no-op을 유지한다.

candidate 전용 optional insert option과 retry 비교를 제거한다. Workflow Activity type과 호출 순서는 그대로 두고 input payload만 축소해 기존 history replay를 보존한다.

### Allowed Alternatives

없음. UUIDv7 생성 Activity는 completion-loss effect 복구를 유지하는 실질적 대안이지만, extra Activity round-trip과 replay versioning을 추가하고 PostgreSQL row default를 직접 사용하지 않으므로 PROD-892의 승인된 선택에서 제외한다.

### Known Traps

- UUID 문자열의 version nibble이나 외부 UUID 라이브러리만 검사해 실제 DB default 사용을 증명하지 않는다.
- 기존 Follow 존재만으로 임의의 stale approve를 성공 처리하지 않는다. Workflow history의 exact pending source와 command expected row가 일치해야 한다.
- pending request bootstrap과 Unfollow exact-source/ABA 경계를 candidate cleanup과 함께 제거하지 않는다.
- 새 UUID 생성 Activity를 끼워 넣어 기존 history의 Activity command 순서를 바꾸지 않는다.

## Risks / Trade-offs

- [Activity commit 뒤 completion 응답이 유실되면 committed Follow/Request의 create effect가 누락될 수 있음] → PROD-892의 명시적 보장 경계로 기록하고 중복 effect 재구성은 하지 않는다.
- [Approve/Accept retry가 외부 DB mutation으로 생성된 Follow를 자신의 결과처럼 볼 수 있음] → exact pending source와 expected Request ID가 일치하는 현재 pair lifecycle에서만 상태를 `ESTABLISHED`로 수렴시키고 effects는 만들지 않는다.
- [진행 중인 기존 Workflow history와 새 bundle의 불일치] → Activity type/순서를 유지하고 이전 코드로 생성한 history replay를 새 bundle로 검증한다.

## Migration Plan

1. canonical 문서와 active delta spec을 승인된 보장 경계로 동기화한다.
2. candidate 생성·전달·판정과 explicit-ID insert를 제거하고 focused DB/Workflow 테스트를 통과시킨다.
3. 이전 bundle로 생성한 Follow/Pending history를 새 bundle로 replay한다.
4. schema migration 없이 one-layer Stack PR로 배포 코드를 전달한다. rollback은 이전 코드로 되돌리되, 이미 DB default로 생성된 UUIDv7 row는 그대로 유효하다.

## Open Questions

없음.
