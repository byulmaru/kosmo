## Context

`packages/core/db/migrate.ts`는 `postgres` client를 `max: 1`로 만들고 session advisory lock을 획득한 뒤 필요하면 `SET ROLE`을 실행하고 Drizzle의 PostgreSQL `migrate()`를 한 번 호출한다. 현재 `drizzle-orm@1.0.0-beta.22`의 migrator는 모든 pending migration과 history insert를 하나의 `db.transaction()` 안에서 실행한다. 이 구조는 전체 batch 실패 시 schema와 history를 함께 rollback하지만, PostgreSQL이 기존 enum의 새 값을 commit 전에는 사용하지 못하므로 파일 사이에 필요한 commit boundary를 제공하지 않는다.

Migration 파일은 timestamp-name 디렉터리의 `migration.sql`과 `--> statement-breakpoint`로 구성되며, 현재 Drizzle의 공개 `readMigrationFiles()`가 name, timestamp, hash와 statement 배열을 반환한다. History는 `drizzle.__drizzle_migrations`의 `id`, `hash`, `created_at`, `name`, `applied_at` 형식을 사용한다. Dev PreSync와 production Job은 모두 동일한 runtime `migrate` command를 호출하므로 실행 의미를 한 경계에서 바꿔야 한다.

## Goals / Non-Goals

**Goals:**

- 각 migration 파일의 SQL과 history insert를 하나의 독립 transaction으로 만든다.
- 기존 Drizzle migration 파일과 history를 그대로 이어서 사용한다.
- 중간 실패 뒤 schema/history 일치와 결정적인 재실행을 보장한다.
- advisory lock, 단일 connection, migration role과 Job command interface를 유지한다.
- enum 추가 파일 다음 파일에서 commit된 새 enum 값을 사용할 수 있게 한다.

**Non-Goals:**

- Drizzle ORM/Kit dependency를 rc.4로 업데이트하지 않는다.
- migration SQL 내부에 transaction 제어문을 넣지 않는다.
- expand/transition/contract phase selector나 destructive migration 승인 장치를 새로 만들지 않는다.
- down migration, 자동 database rollback 또는 별도 Kosmo migration manifest/history 체계를 만들지 않는다.

## Implementation Guidance

### Current Constraints

- Drizzle의 PostgreSQL `migrate()`는 transaction 단위를 설정하는 공개 option을 제공하지 않는다.
- Drizzle 내부 `getMigrationsToRun`과 history upgrade helper에 의존하면 package 내부 경로와 구현 변화에 결합된다.
- History insert를 file transaction 밖에서 실행하면 SQL만 적용되거나 history만 남는 불일치가 생긴다.
- Advisory lock과 `SET ROLE`은 session state이므로 여러 pool connection으로 분산하면 보호와 ownership 계약이 깨진다. 현재 `max: 1` 경계를 유지해야 한다.
- 성공한 앞 파일이 남는 partial apply는 의도된 새 계약이다. 이후 실패를 이유로 앞 파일의 history를 삭제하거나 schema를 되돌리면 안 된다.

### Recommended Approach

공개 `readMigrationFiles()`로 현재 folder의 ordered migration metadata와 statement 배열을 읽고, 기존 `postgres` client의 동일 session에서 history table을 준비·조회한다. History row와 로컬 migration을 name 순서와 hash로 검증한 뒤 pending suffix를 계산한다.

각 pending migration에 대해 `postgres` transaction을 하나 열고 statement를 순서대로 실행한 다음 같은 transaction에서 `drizzle.__drizzle_migrations`에 name, hash, timestamp와 applied time을 기록한다. Callback 성공이 file commit이고 예외는 그 파일 전체 rollback이 된다. Runner는 예외를 삼키지 않고 Job까지 전달하며, advisory lock은 전체 history 검증과 모든 file transaction이 끝날 때까지 유지한다.

History bootstrap은 현재 Drizzle table schema와 ownership을 재현한다. 이미 운영에서 사용하는 extended history schema는 그대로 인식한다. 과거 legacy history shape를 계속 지원해야 한다면 현재 package가 수행하는 upgrade 결과와 동일한 fixture를 통해 호환성을 증명하고, 지원하지 않는 shape를 임의 해석하지 않는다.

Integration test는 임시 migration folder에 여러 디렉터리를 만들어 enum add/use, 중간 DDL 실패, 재실행, history hash 변경과 순서 누락을 실제 PostgreSQL에서 검증한다. 기존 lock, environment connection, role ownership, full repository migration replay test를 유지한다.

### Allowed Alternatives

- `readMigrationFiles()`의 공개 형식이 upstream에서 제거되면 같은 Drizzle folder·breakpoint·hash 결과를 contract test로 고정한 작은 local reader로 대체할 수 있다. History와 검증 의미는 바꾸지 않는다.
- Upstream Drizzle가 #5199와 동등한 파일별 transaction을 정식 release하면 자체 per-file loop 대신 공식 migrator를 사용할 수 있다. 전환 전에 동일한 failure/retry/history integration suite를 통과해야 한다.

### Known Traps

- `node_modules`를 직접 patch하거나 미병합 upstream commit에 의존하지 않는다.
- private package subpath의 `getMigrationsToRun` 또는 upgrade helper를 안정적인 public API처럼 사용하지 않는다.
- migration name만 보고 적용 여부를 결정하면서 적용된 hash 변경을 무시하지 않는다.
- history insert를 file transaction 뒤에 별도로 실행하지 않는다.
- failure recovery에서 성공한 앞 migration을 수동 rollback하거나 history row를 삭제하지 않는다.
- 여러 statement를 하나의 prepared query로 합치지 않고 Drizzle breakpoint 순서를 보존한다.
- test fixture에서 history를 임의로 만들어 실제 Drizzle table shape와 timestamp/hash 의미를 건너뛰지 않는다.

## Risks / Trade-offs

- [전체 batch가 더 이상 atomic하지 않음] → 파일 단위 partial apply를 문서화하고 모든 production migration에 기존 expand/transition/contract 호환성 정책을 계속 적용한다.
- [Drizzle history format 변경과 local runner drift] → public reader와 실제 history fixture를 사용하고 dependency update 때 compatibility suite를 필수 실행한다.
- [Legacy history schema 해석 오류] → 현재 database와 fresh bootstrap shape를 검증하고, 알 수 없는 shape는 SQL 적용 전에 명시적으로 실패한다.
- [Session lock 또는 role이 다른 connection에 적용됨] → `max: 1` client와 하나의 runner lifecycle을 유지하고 ownership·동시 실행 integration test를 보존한다.
- [중간 실패 뒤 기존 workload가 앞의 schema 변경을 봄] → 성공한 각 migration 파일은 구버전 workload와 호환되는 expand 변경이어야 하며 destructive contract는 기존 별도 release gate를 따른다.

## Migration Plan

1. 기존 beta.22 history와 fresh database에서 compatibility tests를 먼저 고정한다.
2. runtime `migrate` command 내부 실행기를 file transaction runner로 교체하되 CLI, Helm Job과 environment interface는 유지한다.
3. fresh full replay, 기존 history incremental replay, enum add/use와 failure/retry integration suite를 실행한다.
4. 새 runner를 PROD-656 release에 포함하고 migration Job 실패 시 새 workload가 활성화되지 않는 기존 barrier를 확인한다.
5. 문제가 발견되면 이미 성공한 migration을 down하지 않는다. 수정한 runner 또는 forward migration의 새 release로 재실행한다.
6. Upstream 공식 지원으로 전환할 때 동일 suite를 통과시킨 뒤 local runner만 제거한다.

## Open Questions

없음.
