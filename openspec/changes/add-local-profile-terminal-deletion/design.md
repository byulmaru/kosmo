## Context

canonical Profile은 `Active | Deactivated | Deleted` lifecycle와 `Normal | Suspended` suspension을 독립 차원으로 정의한다. 현재 runtime은 PostgreSQL·core·GraphQL에 `ProfileState(ACTIVE | DISABLED | SUSPENDED)` 하나만 두고, GraphQL `deleteProfile`이 core `disableProfile`을 호출해 `ACTIVE → DISABLED`만 수행한다. 이 transaction은 Follow row를 보존하면서 Active 상대 Profile의 저장 count를 감소시키고 모든 Session의 `activeProfileId`를 해제하며, 동시 비활성화 deadlock을 한 번 재시도한다.

공개 Profile predicate와 session context뿐 아니라 lookup/search, Follow·Follow Request, Post, Notification, Reaction, Bookmark와 ActivityPub service가 `ProfileState.ACTIVE`를 직접 검사한다. 단일 enum 값을 곧바로 rename하거나 의미를 바꾸면 구버전 workload가 같은 DB를 사용하는 동안 read/write가 실패하고, 기존 `deleteProfile`의 의미를 terminal 삭제로 바꾸면 구버전 caller가 비활성화 대신 비가역 삭제를 실행할 수 있다.

PROD-532는 shared OpenSpec과 통합 검증·archive를 소유하고, PROD-542·543·544가 expand, transition/backfill, contract를 독립 PR·release로 전달한다. PROD-526은 PROD-543의 terminal transaction seam 뒤에 Profile Tag cleanup을 별도 change에서 통합한다. ADR 0020과 `docs/design/profile-tags.md`의 최신 승인 snapshot은 `origin/PROD-523@904c41ce`에 있으며 PR #394는 아직 `main`에 merge되지 않았다.

## Goals / Non-Goals

**Goals:**

- canonical lifecycle와 suspension을 독립적으로 저장하고 모든 현재 소비자가 같은 판정을 사용하게 한다.
- 비활성화, 재활성화와 terminal 삭제를 transport-neutral core action과 서로 다른 GraphQL mutation으로 전달한다.
- 기존 workload와 rollback 대상을 보존하는 expand → transition/backfill → contract rollout을 제공한다.
- 비활성화의 Follow row 보존·저장 count·Session 해제 동작을 유지하고 재활성화에 대칭적인 count 복구를 제공한다.
- Deleted 재시도를 멱등하게 처리하고 downstream cleanup이 terminal state change와 같은 transaction에 들어갈 위치를 하나로 만든다.

**Non-Goals:**

- Profile row, Membership, Follow 또는 다른 관계를 물리 삭제하는 정책
- Profile Tag schema·cleanup 구현, 다른 관계 cleanup, generic cleanup plugin framework
- Remote Profile 삭제, ActivityPub Tombstone·federation delivery
- Account 삭제, 개인정보 파기와 보존 기간
- Profile lifecycle·suspension을 공개 GraphQL field로 노출하는 것

## Implementation Guidance

### Current Constraints

- `Profiles.state`는 non-null default `ACTIVE` 단일 PG enum이며 적용된 초기 migration과 snapshot을 수정할 수 없다.
- 현재 migration runner는 image의 미적용 migration을 모두 순서대로 실행한다. phase selector가 없으므로 contract SQL을 transition image에 미리 넣을 수 없다.
- `visibleProfileWhere`가 Profile state와 Instance state를 함께 판정하고 여러 API loader가 이를 재사용하지만, core service에는 별도 공통 lifecycle predicate가 없다.
- 현재 `deleteProfile` resolver는 공개 visibility predicate를 적용하므로 Deactivated 또는 Deleted Profile을 조회할 수 없고 terminal 최초 호출·재시도를 모두 처리할 수 없다.
- Account.Active와 session identity는 GraphQL auth context가 증명하지만 Local origin, Owner Membership, lifecycle와 suspension은 대상별 조회가 필요하다. public visibility를 권한 조회 대신 사용하면 Deactivated Owner action이 막힌다.
- 비활성화 transaction의 count 보정은 상대 Profile의 현재 Active 여부를 조건으로 한 set-based update이며 동시 양방향 비활성화에서 deadlock 재시도가 필요하다. 재활성화도 같은 동시성 경계를 가져야 한다.
- PROD-526 branch는 legacy `DISABLED`를 Deactivated 의미로 사용해 Owner update를 허용한다. transition mapping은 이 호환 의미를 보존해야 하며 해당 change의 Profile Tag 구현을 이 branch에 복제하지 않는다.

### Recommended Approach

#### 1. PROD-542 additive expand

- 새 lifecycle·suspension enum과 nullable 저장 column을 새 forward migration으로 추가한다. legacy `state`와 기존 default는 그대로 둔다.
- 이 단계에서는 새 column을 authoritative read에 사용하거나 NOT NULL/default를 강제하지 않는다. 구버전 create·disable·lookup이 변화 없이 동작하는지를 migration suite에서 검증한다.
- 새 column이 null인 기존 row와 새 구버전 write를 정상 transition 입력으로 취급한다. 대규모 backfill이나 legacy rename/drop을 포함하지 않는다.

#### 2. PROD-543 transition application과 backfill

- lifecycle·suspension을 해석하는 작은 compatibility 경계를 core DB/query 계층에 두고 공개 visibility와 모든 직접 `ACTIVE` 소비자를 이 경계의 동일한 SQL 조건으로 전환한다. 범용 repository나 caller callback을 만들지 않는다.
- mixed workload 동안 legacy state는 old-writer signal로 남긴다. canonical `DELETED`가 있으면 이를 최우선으로 유지하고, 그렇지 않으면 legacy `ACTIVE`, `DISABLED`, `SUSPENDED`를 specs의 mapping으로 해석한다. 새 action은 canonical과 legacy 호환 결과를 같은 transaction에서 dual-write한다.
- idempotent backfill은 canonical 값이 비어 있는 row만 legacy mapping으로 채우고 이미 `DELETED`이거나 새 action이 쓴 값을 덮어쓰지 않는다. null·mapping mismatch·legacy-only write를 반복 실행 가능한 검증 query와 배포 evidence로 남긴다.
- GraphQL lifecycle resolver는 public `visibleProfileWhere`를 사용하지 않고 Active Account context 아래 Account–Profile Membership, Owner role, configured Local Instance와 현재 canonical 상태를 조회한다. non-Owner·Remote·상태 오류는 target을 변경하지 않으며 terminal 재시도만 Deleted Owner에게 같은 ID를 반환한다.
- 새 mutation은 `deactivateProfile`, `reactivateProfile`, `deleteDeactivatedProfile`로 분리한다. legacy `deleteProfile`은 transition 동안 deactivation compatibility alias로 유지·deprecate하고 terminal action을 호출하지 않는다.
- core의 central lifecycle action이 transaction을 소유한다. Deactivate는 현재 count 감소와 Session 선택 해제를 유지하고, Reactivate는 보존된 Follow 중 현재 Active 상대와의 count만 대칭적으로 복구하며 Session 선택은 자동 복원하지 않는다. Delete는 Deactivated·Normal을 Deleted로 CAS하고 count를 다시 바꾸지 않는다.
- terminal transaction 본문은 downstream code가 직접 확장할 수 있는 한 곳으로 유지한다. PROD-526이 같은 transaction에서 Profile Tag relation delete를 추가할 수 있게 하되 callback registry, event bus 또는 generic cleanup interface를 선제 도입하지 않는다.
- 기존 한 번의 deadlock retry를 lifecycle count transaction에 공통 적용하고, 조건부 update가 승자를 정하도록 한다. 명시적 row/table lock을 새로 추가하지 않는다.

#### 3. PROD-544 contract

- 모든 active·preview와 rollback 대상 workload가 transition image로 전환된 뒤 backfill null·mismatch·legacy-only write가 허용 기준 안인지 다시 측정한다.
- 승인된 rollback window, backup/restore와 production contract 승인을 기록한 별도 release에서 canonical column을 required/default로 만들고 legacy column·enum과 compatibility read/write를 제거한다.
- 같은 contract에서 deprecated `deleteProfile`을 제거하되 terminal 의미로 재사용하지 않는다. 새 lifecycle mutation과 generated SDL을 최종 schema로 검증한다.

### Allowed Alternatives

- application compatibility projection 대신 제한된 DB trigger로 old-writer 변경을 canonical column에 동기화할 수 있다. 다만 trigger가 `DELETED`를 되돌리지 않고 독립 lifecycle+suspension 조합과 rollback·관측 계약을 동일하게 만족하며, 숨은 write 경계를 PR에서 명시적으로 검증해야 한다.
- backfill을 migration SQL이 아니라 재실행 가능한 운영 command로 수행할 수 있다. 어느 방식이든 batch/progress, 중단 재개, mismatch 검증과 contract gate evidence가 있어야 한다.

### Known Traps

- PG enum value를 제자리 rename하거나 `DISABLED` 의미를 한 release에서 바꾸기
- `SUSPENDED`를 lifecycle 값으로 계속 두어 Deactivated+Suspended 조합을 잃기
- expand migration에 contract drop/rename을 함께 넣거나 current runner가 알아서 건너뛸 것으로 기대하기
- legacy `deleteProfile`을 terminal action으로 repurpose하기
- public Profile loader로 Deactivated/Deleted Owner 권한을 확인해 최초 삭제나 retry를 막기
- Deleted를 Profile row delete로 구현해 Membership·Follow·Post·Notification FK cascade를 발생시키기
- Profile Tag cleanup을 비활성화에 연결하거나 이 change에 PROD-526 구현을 복제하기
- 일부 `ProfileState.ACTIVE` predicate만 바꿔 lookup·session·notification·ActivityPub 사이 visibility를 다르게 만들기
- 재활성화에서 상대 상태를 무시해 저장 count를 중복 증가시키거나 비활성 상대를 포함하기
- contract gate 없이 legacy column, enum 또는 deprecated mutation을 제거하기

## Risks / Trade-offs

- [Risk] mixed workload에서 legacy와 canonical state가 잠시 불일치할 수 있다. → canonical Deleted 우선순위, atomic dual-write, idempotent backfill과 null·mismatch·legacy-only write 관측으로 제한한다.
- [Risk] 직접 `ACTIVE` predicate가 많아 누락 시 비공개 Profile 노출 또는 정상 action 차단이 생긴다. → repository-wide symbol inventory와 core/API integration matrix를 PROD-543 검증에 포함한다.
- [Risk] deactivate/reactivate count 보정이 동시 실행되면 deadlock이나 중복 보정이 생길 수 있다. → 조건부 state transition과 상대 state predicate, 기존 deadlock retry, concurrent transition test를 유지한다.
- [Risk] legacy mutation 유지 기간에 API 표면이 일시적으로 중복된다. → 명확히 deprecate하고 새 client는 새 mutation만 사용하며 PROD-544에서 제거한다.
- [Trade-off] Deleted row와 관계를 보존하면 즉시 저장 공간을 회수하지 못한다. → canonical terminal identity와 downstream cleanup policy를 보존하며 물리 파기는 별도 Account/privacy 계약으로 남긴다.
- [Risk] PR #394가 merge 전에 변경되면 Profile Tag cleanup seam의 authority가 drift할 수 있다. → 각 구현·archive gate에서 최신 canonical head와 Linear comments를 다시 대조한다.

## Migration Plan

1. **Expand / PROD-542**
   - nullable canonical state storage만 추가하는 forward migration을 배포한다.
   - 구버전 create·disable·lookup, schema shape, migration lock duration을 검증한다.
   - rollback은 workload를 그대로 유지하고 사용되지 않는 additive column을 남기는 방식으로 수행한다.
2. **Transition / PROD-543**
   - compatibility read와 atomic dual-write, 새 lifecycle action·GraphQL schema를 배포한다.
   - 모든 `ProfileState.ACTIVE` 소비자, Session 선택, Follow count, permission과 idempotency test를 통과한다.
   - backfill을 idempotently 실행하고 null·mismatch·legacy-only write를 관측한다.
   - rollback 시 구버전은 dual-write된 legacy state를 계속 읽으며 canonical Deleted row는 legacy DISABLED로 숨긴다.
3. **Drain / Contract Gate**
   - active·preview·rollback 대상 image를 확인하고 구버전을 drain한다.
   - rollback window 종료, backup/restore와 production 승인을 기록한다.
4. **Contract / PROD-544**
   - 별도 forward migration으로 canonical column constraint/default를 확정하고 legacy storage·compatibility code를 제거한다.
   - generated GraphQL SDL, runtime schema, migration과 회귀 test를 다시 검증한다.
   - contract 뒤 old workload rollback은 지원하지 않으며 필요하면 승인된 backup/forward recovery를 사용한다.
5. **Integration / PROD-532**
   - PROD-526 terminal Profile Tag cleanup 연결과 전체 canonical·Linear·OpenSpec 정합성을 대조한다.
   - 통합 scenario와 strict validation을 통과한 뒤 shared change를 archive한다.

## Open Questions

- PROD-544의 정확한 rollback 보장 기간과 production contract 실행 시점은 transition 관측 결과를 근거로 Contract Gate에서 승인한다. 이 운영 결정은 PROD-542·543 착수를 막지 않는다.
- PR #394가 merge되기 전까지 ADR 0020과 `docs/design/profile-tags.md`의 authority snapshot은 `origin/PROD-523@904c41ce`로 고정하며, head 변경 시 artifact와 승인 snapshot을 다시 대조한다.
