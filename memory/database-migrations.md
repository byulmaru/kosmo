# Database Migration Workflow

## Purpose

PostgreSQL/Drizzle schema를 변경하거나 리뷰할 때 이 문서를 사용한다. 특히 column/table/enum/constraint를
rename, drop, rewrite하거나 기존 row의 의미를 바꾸는 변경은 구현 전에 이 절차로 전달 단위를 나눈다.

이 문서는 repository 작업 순서를 정의한다. 현재 dev migration runner의 사용법은 `memory/script.md`, schema
shape와 naming은 `memory/database-design.md`, Issue와 OpenSpec 경계는 `memory/issue-openspec-workflow.md`를
함께 따른다.

## Classify Before Generating SQL

새 migration을 만들기 전에 구버전과 신버전 workload가 같은 DB를 동시에 사용해도 되는지 판단한다. 확실하지
않으면 breaking으로 분류한다.

Safe/additive 후보:

- 구버전이 모르는 nullable column이나 독립 table 추가.
- 구버전 query와 write를 바꾸지 않는 index 또는 constraint 준비.
- 기존 row와 API 의미를 바꾸지 않고 old/new workload가 모두 동작하는 변경.

Additive SQL이라고 자동으로 안전한 것은 아니다. table rewrite, 장시간 lock, transaction 안에서 실행할 수 없는
index 작업과 즉시 검증되는 constraint는 별도로 실행 계획을 검토한다.

Breaking/destructive 후보:

- column, table, enum value, index 또는 constraint의 rename/drop.
- column type rewrite, 의미 변경 또는 기존 값의 재해석.
- 기존 nullable column을 즉시 `NOT NULL`로 변경.
- 구버전 read/write가 실패하거나 rollback 대상 workload를 깨뜨리는 변경.

## Standard Breaking-Change Sequence

```text
Expand / pre-migrate
  -> Transition application
  -> Backfill and verify
  -> Drain old workloads and close rollback window
  -> Approved Contract / post-migrate
```

각 단계는 독립 Linear 구현 이슈, PR과 release로 전달한다. 여러 단계가 하나의 행동 계약을 공유하면 하나의
OpenSpec change를 공유할 수 있지만, 각 PR의 merge와 배포 gate는 분리한다.

### 1. Expand / pre-migrate

- 새 nullable column/table처럼 구버전과 신버전이 모두 사용할 수 있는 schema만 추가한다.
- expand migration 적용 후에도 현재 active/preview workload와 rollback 대상 version이 정상 동작해야 한다.
- transition 또는 contract code를 이 단계의 완료 조건으로 숨기지 않는다.
- contract SQL은 이 PR이나 runtime image에 포함하지 않는다.
- 적용 후 schema, lock duration과 구버전 read/write 호환을 확인한다.

### 2. Transition application and backfill

- 별도 PR에서 애플리케이션을 새 schema로 전환한다.
- 전환 기간에 필요하면 dual write, `COALESCE(new_column, old_column)` read 또는 같은 수준의 compatibility
  adapter를 사용한다.
- data backfill은 재실행 가능하고 중단 후 이어갈 수 있어야 한다. 큰 backfill은 단일 DDL transaction에
  숨기지 않고 batch, progress와 실패 관측 경계를 둔다.
- API/web active와 preview를 포함한 모든 workload가 전환됐는지 image identity와 runtime 상태로 확인한다.
- production에서는 migration Job과 workload가 같은 immutable release를 사용해야 한다. 이 장치는 PROD-288이
  소유한다.

### 3. Contract gate

다음을 모두 근거로 확인하기 전에는 contract 이슈나 PR을 merge하지 않는다.

- backfill이 완료됐고 null, mismatch와 legacy write가 허용 기준 안에 있다.
- 구버전 active/preview Pod와 rollback 대상 ReplicaSet이 drain됐다.
- 합의한 rollback 보장 기간이 끝났다.
- backup/restore와 rollback 절차가 준비됐다.
- production contract 실행에 필요한 명시적 승인을 받았다.

Argo CD `PostSync` 성공만으로 이 gate를 대체하지 않는다. `PostSync` 시점에는 구버전 ReplicaSet이나 rollback
경로가 남아 있을 수 있다.

### 4. Contract / post-migrate

- gate를 통과한 뒤 별도 PR과 release에서 legacy column/table/constraint를 제거한다.
- contract는 승인된 별도 Job으로 실행하거나, 나중 release에 처음 포함해 그 release의 PreSync에서 실행할 수
  있다. 어느 방식이든 구버전이 다시 실행될 가능성이 없어야 한다.
- contract 실행 후 schema, application error, mismatch와 rollback 가능 범위를 다시 확인한다.
- contract와 함께 compatibility code를 제거할 수 있지만, 독립적으로 rollback해야 한다면 cleanup PR을 한 번 더
  분리한다.

## Current Drizzle Runner Boundary

현재 `migrate` command는 runtime image의 `drizzle/` 아래에서 Drizzle history에 없는 migration을 모두 읽어 한
번에 적용한다. PostgreSQL advisory lock은 동시 runner를 막지만 migration phase를 선택하지 않는다.

따라서 다음 규칙을 지킨다.

- Drizzle history에 기록된 migration의 directory name이나 SQL을 수정, 이동 또는 재생성하지 않는다. 이미 적용된
  migration의 오류는 새 forward migration으로 수정한다.
- expand와 contract migration을 같은 transition image에 포함하지 않는다.
- 아직 실행하면 안 되는 contract SQL을 미리 commit한 뒤 현재 runner가 알아서 건너뛸 것이라고 기대하지 않는다.
- 단순한 breaking change는 phase-aware custom runner보다 PR/release 분리를 우선한다.
- 별도 pre/post folder, history table 또는 phase selector는 반복되는 운영 필요와 recovery 계약이 확인된 뒤
  PROD-269 범위에서 설계한다.
- dev의 mutable `latest`와 downtime 허용 예외를 production migration의 선례로 사용하지 않는다.

## Issue, OpenSpec And PR Shape

권장 이슈 구조:

```text
Breaking-change contract issue
  -> Expand implementation issue / PR / release
  -> Transition and backfill implementation issue / PR / release
  -> Contract implementation issue / PR / release
```

- 계약 이슈는 전체 호환성 목표, rollback window와 contract 완료 조건을 소유한다.
- 구현 이슈는 한 단계의 독립 결과와 검증만 소유한다.
- PR 본문에는 선행 PR, 현재 단계, 다음 단계와 아직 merge하면 안 되는 contract dependency를 명시한다.
- 단계가 여러 PR에 걸쳐 하나의 계약을 공유하면 OpenSpec을 마지막 contract와 검증이 끝날 때까지 active로
  유지한다. 중간 PR 하나가 끝났다는 이유로 archive하지 않는다.
- contract SQL이 필요한 사실을 발견했지만 gate가 준비되지 않았다면 현재 PR에 넣지 않고 후속 Linear 이슈로
  만든다.

## Example: Rename A Column

물리 column rename을 한 release에서 처리하지 않는다.

1. **Expand:** 새 column을 nullable로 추가한다. 구버전은 기존 column을 계속 사용한다.
2. **Transition:** 새 코드는 필요한 기간 두 column에 write하고 새 값 우선으로 read한다.
3. **Backfill:** 기존 row를 idempotent하게 채우고 mismatch와 legacy write를 관측한다.
4. **Gate:** 모든 workload 전환, 구버전 drain, rollback window 종료와 승인을 확인한다.
5. **Contract:** legacy column과 compatibility code를 제거한다.

## Review Checklist

- 이 변경은 구버전과 신버전이 같은 DB를 사용할 때 안전한가?
- breaking이면 expand, transition/backfill과 contract가 독립 이슈와 release로 나뉘었는가?
- transition image에 contract SQL이 미리 포함되지 않았는가?
- backfill은 idempotent하고 진행률과 실패를 확인할 수 있는가?
- active/preview와 rollback 대상 구버전이 모두 drain됐는가?
- rollback window, backup/restore와 승인이 확인됐는가?
- migration Job과 workload가 같은 immutable release를 사용하는가?
- PR과 OpenSpec 완료 상태가 전체 계약의 실제 진행 상태를 반영하는가?
