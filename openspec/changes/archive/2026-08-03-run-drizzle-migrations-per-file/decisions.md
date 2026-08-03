## Context

이 결정 기록은 `PROD-656`의 파일별 PostgreSQL migration 실행 계약, 상위 `PROD-269`의 production migration 원칙, `docs/operations/production-migrations.md`와 database migration memory, 현재 Drizzle beta.22 runner와 production/dev의 공통 `migrate` command 경계를 반영한다.

## Decision Records

### Migration 파일을 atomicity와 history 기록 단위로 사용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`
- Status: Active
- Context / Problem: 모든 pending 파일을 하나의 transaction으로 실행하면 기존 PostgreSQL enum에 추가한 값을 다음 파일에서 사용할 수 없다. 반대로 migration SQL 안에서 수동 commit하면 schema 변경과 해당 history가 서로 다른 transaction에 놓여 불일치가 생길 수 있다.
- Decision Outcome: 각 migration 파일의 모든 SQL과 해당 Drizzle history insert를 하나의 독립 transaction으로 실행한다. File transaction이 성공하면 둘을 함께 commit하고 실패하면 둘을 함께 rollback한다.
- Alternatives Considered: 전체 pending batch transaction은 PostgreSQL enum commit 경계를 제공하지 못해 제외했다. Migration SQL 내부 `COMMIT; BEGIN;`은 history 불일치와 숨은 영구 checkpoint를 만들므로 제외했다. Enum별 preflight는 공통 migration runner를 특정 schema 변경에 결합하므로 제외했다.
- Consequences: 전체 batch atomicity는 사라지고 성공한 앞 파일은 뒤 파일 실패 후에도 남는다. 모든 production migration은 파일 단위 partial apply를 고려해 구버전 workload와 호환되는 expand/transition/contract 정책을 따라야 한다.
- Confirmation / Follow-up: Enum add/use 연속 migration, 중간 파일 실패와 재실행 integration test에서 schema와 history가 파일 단위로 함께 남거나 사라지는지 확인한다.

### 기존 Drizzle migration 형식과 history를 유지한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`
- Status: Active
- Context / Problem: Transaction 경계만 바꾸기 위해 migration 작성 도구, version-controlled directory 또는 database history를 Kosmo 고유 형식으로 교체하면 기존 migration과 Drizzle Kit workflow를 이어갈 수 없다.
- Decision Outcome: Runner는 Drizzle folder 순서, `--> statement-breakpoint`, name, timestamp, hash와 기존 `drizzle.__drizzle_migrations` table을 그대로 사용한다. 별도 manifest나 history table을 만들지 않는다.
- Alternatives Considered: Kosmo 고유 journal/history는 migration 생성·검증 도구까지 분기시키므로 제외했다. 적용된 history를 새 table로 일괄 변환하는 방식은 불필요한 운영 migration과 복구 위험 때문에 제외했다.
- Consequences: Runner는 dependency update마다 Drizzle 형식과 history 호환성을 검증해야 한다. Upstream 공식 파일별 transaction 지원으로 돌아갈 수 있는 경계가 유지된다.
- Confirmation / Follow-up: 기존 runner가 만든 history fixture, fresh database 전체 replay와 incremental replay를 같은 suite에서 검증한다.

### 적용된 history를 순서 prefix와 hash로 검증한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `memory/database-migrations.md`, Linear `PROD-656`
- Status: Active
- Context / Problem: 적용 여부를 name만으로 판단하면 적용된 migration 파일의 누락, 순서 변경 또는 내용 변경을 조용히 통과시켜 database schema와 version control의 대응을 잃을 수 있다.
- Decision Outcome: 새 migration SQL을 실행하기 전에 database history가 로컬 migration 순서의 유효한 prefix이고 각 적용 항목의 hash가 일치하는지 검증한다. 위반 시 history를 고치거나 새 SQL을 실행하지 않고 실패한다.
- Alternatives Considered: Drizzle beta.22와 같은 name-only pending filter는 적용된 파일 변조를 감지하지 못해 제외했다. History를 현재 local state에 맞춰 자동 rewrite하는 방식은 실제 적용 schema를 증명하지 못하므로 제외했다.
- Consequences: 과거 적용 migration 파일을 수정, 이동 또는 제거한 checkout에서는 migration이 즉시 실패한다. 복구는 history 수동 성공 처리보다 원본 migration 복원 또는 명시적인 운영 판단을 요구한다.
- Confirmation / Follow-up: Hash 변경, 중간 파일 누락과 잘못된 order fixture가 migration SQL 실행 전에 실패하는지 검증한다.

### Public Drizzle reader와 local per-file executor를 조합한다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-656`
- Status: Active
- Context / Problem: Drizzle `migrate()`에는 file transaction option이 없고, private pending-selection/history-upgrade helper에 의존하면 package 내부 변화에 결합된다. 동시에 Drizzle migration parsing을 불필요하게 다시 구현해서는 안 된다.
- Decision Outcome: 공개 `readMigrationFiles()`로 migration metadata와 statement를 읽고 Kosmo runner가 동일 database session에서 history 검증과 file transaction 실행을 소유한다. Private package subpath helper는 사용하지 않는다.
- Alternatives Considered: `node_modules` patch와 미병합 upstream commit 사용은 install/update 재현성이 낮아 제외했다. Drizzle parser 전체 복제는 공개 reader가 존재하는 동안 불필요하다. 공개 reader가 제거되면 동일 결과를 contract test로 고정한 작은 local reader는 허용된다.
- Consequences: History bootstrap과 pending prefix 검증은 Kosmo code가 명시적으로 소유한다. Drizzle dependency update 로그와 compatibility tests를 함께 검토해야 한다.
- Confirmation / Follow-up: Package public export 사용 여부, private subpath import 부재와 실제 migration fixture의 breakpoint/hash 결과를 확인한다.

### Advisory lock, role과 command interface를 유지한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-564`, `PROD-616`, `PROD-656`
- Status: Active
- Context / Problem: File별 transaction으로 바뀌어도 동시 runner 방지, migration login과 owner role의 분리, Helm Job과 runtime image 사이의 interface는 기존 production 계약이다.
- Decision Outcome: 하나의 `max: 1` client session에서 advisory lock을 전체 실행 동안 유지하고, 필요하면 SQL 전에 owner role로 전환한다. External command는 계속 `migrate`이며 database target이나 phase input을 추가하지 않는다.
- Alternatives Considered: File마다 새 connection을 여는 방식은 session lock과 role state를 잃을 수 있어 제외했다. Migration credential을 runtime credential로 대체하거나 Job argument를 확장하는 방식은 기존 production 경계를 위반해 제외했다.
- Consequences: Runner 내부 transaction만 바뀌고 Helm, Argo CD와 release workflow interface는 유지된다. Session lifecycle 회귀는 동시 실행과 ownership 장애로 이어질 수 있다.
- Confirmation / Follow-up: 기존 advisory lock, environment connection과 role ownership integration test를 보존하고 file transaction suite와 함께 실행한다.

### 실패는 forward retry로 복구하고 자동 down을 실행하지 않는다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`
- Status: Active
- Context / Problem: 중간 파일 실패 시 앞 파일은 이미 schema와 history가 함께 commit되어 있다. 이를 전체 release 실패로 간주해 자동으로 되돌리면 임의의 down migration과 history 조작이 필요하다.
- Decision Outcome: Runner는 실패한 file transaction을 rollback하고 Job을 실패시킨다. 성공한 앞 파일은 유지하며, 원인을 수정한 release 또는 forward migration이 history의 다음 파일부터 재실행한다.
- Alternatives Considered: 전체 database 자동 rollback은 다른 workload와 성공한 migration을 훼손할 수 있어 제외했다. 성공 history 삭제 또는 수동 성공 처리는 schema/history 대응을 잃으므로 제외했다.
- Consequences: 운영자는 partial apply를 정상적인 recoverable state로 다뤄야 하고, 새 workload는 migration Job 전체 성공 전까지 활성화되지 않는다.
- Confirmation / Follow-up: 중간 실패 후 Job barrier, history 상태와 수정 후 retry를 production-equivalent test로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
