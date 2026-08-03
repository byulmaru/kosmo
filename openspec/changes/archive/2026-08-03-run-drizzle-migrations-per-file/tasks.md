## 1. PROD-656 Drizzle 호환 file transaction runner

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`
- `PROD-269`
- `PROD-656`

**Deliverable**

Runtime `migrate` command가 기존 Drizzle migration과 history를 이어서 사용하면서 각 pending 파일의 SQL과 history를 독립 transaction으로 적용한다.

**Guardrails**

- 한 파일의 SQL과 history insert는 함께 commit하거나 rollback한다.
- 기존 Drizzle folder, statement breakpoint, name, timestamp, hash와 `drizzle.__drizzle_migrations`를 유지한다.
- 적용된 history가 로컬 migration의 유효한 prefix이고 hash가 일치하지 않으면 새 SQL을 실행하지 않는다.
- 전체 실행 동안 기존 단일 connection, advisory lock과 migration owner role을 유지한다.
- External command는 `migrate`로 유지하고 phase/database target input을 추가하지 않는다.
- Private Drizzle package subpath helper나 `node_modules` patch에 의존하지 않는다.

**Verification**

- 기존 Drizzle history fixture와 fresh history bootstrap에서 pending suffix만 실행되는지 검증한다.
- 적용된 hash 변경, migration 누락과 잘못된 순서가 SQL 실행 전에 거부되는지 검증한다.
- 기존 advisory lock, environment connection과 role ownership integration test가 통과한다.

- [x] 1.1 현재 Drizzle migration parsing과 history shape를 재현하는 compatibility fixture를 추가하고 기존 history에서 pending suffix를 식별하는 검증을 고정한다.
- [x] 1.2 specs와 active decisions를 만족하도록 runtime migration 실행 경계를 파일별 SQL+history transaction으로 변경한다.
- [x] 1.3 적용된 history의 prefix, name과 hash 무결성 검증 및 변경·누락·순서 오류의 실행 전 실패를 구현한다.
- [x] 1.4 기존 no-op 재실행, advisory lock, PostgreSQL 환경 연결과 migration role ownership 검증을 새 runner에서 통과시킨다.

## 2. PROD-656 실패·재실행과 PostgreSQL enum 검증

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`
- `PROD-269`
- `PROD-656`

**Deliverable**

여러 pending migration 중 한 파일이 실패해도 성공한 앞 파일과 그 history는 함께 유지되고 실패한 파일은 함께 rollback되며, 재실행과 enum 연속 migration이 안전하게 완료된다.

**Guardrails**

- 실패한 파일 이후 migration은 실행하지 않는다.
- 성공한 앞 migration의 schema나 history를 자동 rollback 또는 삭제하지 않는다.
- 실패한 migration을 수동 또는 자동으로 적용 완료 처리하지 않는다.
- Migration SQL 내부에 `COMMIT; BEGIN;`이나 enum별 preflight를 넣지 않는다.

**Verification**

- 실제 PostgreSQL에서 첫 파일 성공, 중간 파일 실패, 뒤 파일 미실행과 schema/history 상태를 검사한다.
- 실패 원인을 제거한 재실행이 실패 파일부터 진행하는지 검사한다.
- 한 파일의 enum add가 commit된 뒤 다음 파일의 default/DML에서 새 값을 사용할 수 있는지 검사한다.
- 파일 내부 여러 statement 중 후반 실패가 그 파일의 앞 statement와 history까지 rollback하는지 검사한다.

- [x] 2.1 여러 pending 파일의 중간 실패에서 file 단위 schema/history atomicity와 뒤 파일 미실행을 검증한다.
- [x] 2.2 중간 실패 후 재실행이 이미 성공한 파일을 건너뛰고 실패했던 파일부터 완료되는지 검증한다.
- [x] 2.3 PostgreSQL enum value 추가 파일 다음 파일에서 새 값을 사용하는 production-equivalent integration test를 추가한다.
- [x] 2.4 한 migration 파일 내부 statement 실패가 해당 파일의 모든 변경과 history를 rollback하는지 검증한다.

## 3. PROD-656 전체 replay와 운영 계약 동기화

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`
- `PROD-269`
- `PROD-656`

**Deliverable**

Fresh database와 기존 database 모두 새 runner로 migration할 수 있고, dev/production 운영 문서가 파일 단위 partial apply와 forward retry 계약을 정확히 설명한다.

**Guardrails**

- Production migration 실패 시 같은 release의 새 workload는 활성화하지 않는다.
- Destructive migration의 expand/transition/contract와 backup/restore gate는 그대로 유지한다.
- 이미 적용된 migration 파일이나 history를 수정해 검증을 통과시키지 않는다.
- Drizzle rc.4 dependency 업데이트와 upstream runner 전환은 이 change에 포함하지 않는다.

**Verification**

- 빈 PostgreSQL에서 repository의 전체 migration replay를 두 번 실행해 첫 실행과 no-op 재실행을 확인한다.
- 기존 history에서 새 migration을 적용하는 incremental path를 확인한다.
- 관련 typecheck, formatting, focused test와 workspace migration check를 통과시킨다.
- 문서와 active spec delta가 실제 runner 실패·복구 의미와 일치하는지 검토한다.

- [x] 3.1 빈 database 전체 migration replay와 두 번째 no-op 실행을 새 runner로 검증한다.
- [x] 3.2 기존 database history에서 incremental migration을 적용하고 history count/hash가 예상과 일치하는지 검증한다.
- [x] 3.3 production migration runbook과 database migration memory를 파일 단위 atomicity, partial apply와 forward retry 계약으로 갱신한다.
- [x] 3.4 OpenSpec strict validation, formatting, typecheck와 관련 integration suite를 실행하고 결과를 PROD-656 및 PR에 기록한다.
