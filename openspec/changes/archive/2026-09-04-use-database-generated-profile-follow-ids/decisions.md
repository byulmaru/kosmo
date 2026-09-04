## Context

이 결정 기록은 PROD-892와 동기화한 Follow/Follow Request canonical 문서, 기존 PostgreSQL `uuidv7()` data-model 계약, completion-loss 보장 경계 및 구현 설계를 반영한다.

## Decision Records

### 신규 Follow와 Follow Request identity는 PostgreSQL default가 소유한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`, PROD-892
- Status: Active
- Context / Problem: Follow pair Workflow의 Temporal `uuid4()` candidate가 모든 주요 도메인 신규 행 ID를 PostgreSQL 18.4 `uuidv7()` column default로 생성하는 계약을 우회한다.
- Decision Outcome: 신규 ProfileFollow와 ProfileFollowRequest insert는 ID를 지정하지 않고 PostgreSQL default를 사용한다. 정상 transaction Activity 완료 시 DB가 반환한 row ID를 결과와 create effect source로 사용한다.
- Alternatives Considered: 애플리케이션 UUIDv7 generator는 생성 책임과 검증을 중복하므로 제외했다. `SELECT uuidv7()` 생성 Activity는 같은 DB 함수를 사용하지만 extra Activity와 replay versioning을 추가하고 row default를 직접 사용하지 않으므로 제외했다.
- Consequences: candidate input과 explicit-ID insert가 제거되고 정상 생성 경로가 단순해진다. UUID 생성 Activity round-trip, 새 dependency와 DB migration은 없다.
- Confirmation / Follow-up: 실제 DB transition 테스트에서 반환 row의 `uuid_extract_version(id) = 7`, result/effect source 일치와 duplicate row/effect 부재를 확인한다.

### Completion-loss retry는 관계 상태만 수렴시키고 create effect를 복원하지 않는다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`, PROD-892
- Status: Active
- Context / Problem: candidate identity를 제거하면 transaction Activity commit 뒤 completion 응답이 유실된 retry가 기존 row를 이번 transition의 commit으로 확정할 수 없다.
- Decision Outcome: retry는 pair uniqueness와 exact-row 조건으로 중복 mutation을 막고 현재 committed 관계 상태로 수렴한다. 기존 Follow/Request를 근거로 create effect를 재구성하지 않는다. Approve/Accept는 Workflow history의 pending Request ID와 command expected ID가 일치하고 현재 exact-pair Request는 없으며 Follow가 존재할 때 effects 없이 `ESTABLISHED`로 종료한다.
- Alternatives Considered: candidate UUID Activity, transaction receipt, outbox, sweeper와 reconciliation으로 후속 effect를 복구할 수 있지만, 사용자가 이 희귀 failure window의 effect 누락을 수용했고 해당 메커니즘의 상태·운영 비용이 범위를 초과해 제외했다.
- Consequences: commit된 Follow 또는 Follow Request는 유지되지만 해당 transition의 Notification/Fedify create effect가 누락될 수 있다. 기존 pending request bootstrap과 Unfollow exact deleted-source/ABA 복구는 유지한다.
- Confirmation / Follow-up: completion-loss에 해당하는 같은 transition 재실행에서 row와 effect가 중복되지 않고, approve/Accept lifecycle이 `PENDING`에 남지 않는지 검증한다.

### 기존 Workflow history의 Activity command 순서를 유지한다

- Decision Date: 2026-09-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-892
- Status: Active
- Context / Problem: 진행 중인 pair Workflow는 코드 배포 뒤 기존 history를 replay해야 하며 새 UUID 생성 Activity를 삽입하면 command sequence가 바뀐다.
- Decision Outcome: 기존 transaction Activity type과 호출 순서는 유지하고 input payload에서 candidate 필드만 제거한다. 별도 UUID 생성 Activity나 patch branch는 추가하지 않는다.
- Alternatives Considered: Temporal patch/versioning으로 신규 UUID Activity를 조건부 추가할 수 있으나 승인된 completion-loss 보장에 필요하지 않고 장기 호환 코드가 늘어나므로 제외했다.
- Consequences: 기존 history replay surface는 Activity input 변경으로 제한된다. 이전 bundle이 만든 대표 history를 새 bundle로 replay해 호환성을 확인해야 한다.
- Confirmation / Follow-up: 이전 Workflow bundle로 생성한 Open/Pending/Approve history에 Worker replay test를 실행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- PROD-720의 “Workflow가 생성할 Follow/Request candidate ID를 transaction 전에 배정하고 completion-loss retry에서 create effect를 재구성한다” 결정은 위 두 Active 결정으로 대체한다. 새 data-model 계약을 우회했고 PROD-892에서 effect 누락을 수용했기 때문이다. 당시 변경의 역사적 OpenSpec archive는 수정하지 않는다.
