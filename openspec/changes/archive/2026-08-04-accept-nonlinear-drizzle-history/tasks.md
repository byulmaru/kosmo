## 1. PROD-656 비선형 Drizzle history 호환 runner

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`
- `PROD-269`
- `PROD-656`

**Deliverable**

Runtime migration command가 정상적인 비선형 Drizzle history를 그대로 인식하고, 적용된 name/hash를 건너뛴 미적용 파일만 version-control 순서의 독립 transaction으로 실행한다.

**Guardrails**

- 적용된 name은 로컬 migration에 존재하고 hash가 같아야 한다.
- DB row 순서가 로컬 timestamp 정렬과 다르다는 이유로 history를 거부하거나 재작성하지 않는다.
- 로컬에 없는 history, 같은 name의 hash 변경과 중복 name/history는 새 SQL 전에 거부한다.
- 한 파일의 SQL과 history insert, advisory lock, 단일 session과 migration role 경계를 유지한다.

**Verification**

- 비선형 current history의 no-op과 pending 선택, 변조·누락·중복 거부를 PostgreSQL integration에서 검증한다.
- 기존 파일별 transaction, enum add/use, advisory lock과 role ownership 검증을 함께 통과시킨다.

- [x] 1.1 Current history를 name/hash 집합으로 검증하고 미적용 name만 local 순서로 실행하도록 runner를 수정한다.
- [x] 1.2 Legacy history를 timestamp/hash 대응으로 안전하게 승격하고 비선형 row 순서를 보존한다.
- [x] 1.3 알 수 없는 history, hash 변경, 중복 local/DB name을 SQL 실행 전에 거부한다.

## 2. PROD-656 existing-history regression과 계약 동기화

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`
- `PROD-269`
- `PROD-656`

**Deliverable**

실제 dev와 같은 비선형 적용 이력이 자동 검증되고 active migration 계약과 운영 문서가 runner의 pending 의미를 정확히 설명한다.

**Guardrails**

- Fresh DB replay만으로 existing DB 호환성을 대신하지 않는다.
- Dev history를 테스트 통과를 위해 수동 재정렬하거나 성공 처리하지 않는다.
- Drizzle dependency 업데이트와 upstream migrator 전환은 포함하지 않는다.

**Verification**

- 실제 dev의 30개 name 순서 또는 동등한 6쌍 역전 fixture에서 name/hash set equality, no-op과 추가 pending 적용을 검증한다.
- Fresh replay, 두 번째 no-op, typecheck, lint, formatting과 OpenSpec strict validation을 통과시킨다.

- [x] 2.1 비선형 current/legacy history와 추가 pending migration을 포함한 regression을 추가한다.
- [x] 2.2 Process smoke가 existing 비선형 history에서도 실제 `db:migrate` entrypoint no-op을 검증하게 한다.
- [x] 2.3 Active specs, runbook과 database migration memory의 strict-prefix 표현을 name/hash 집합 계약으로 동기화한다.
- [x] 2.4 관련 migration integration, smoke, workspace check와 OpenSpec strict validation을 실행한다.

## 3. PROD-656 dev 배포 재검증과 완료 판단

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`
- `PROD-656`

**Deliverable**

후속 수정이 merge된 실제 dev DB에서 PreSync migration과 후속 Rollout이 성공하고 재실행이 history/schema 변경 없는 no-op임을 관찰한 뒤 PROD-656 완료 여부를 판단한다.

**Guardrails**

- Migration Job 실패 시 API/Web Rollout restart를 진행하지 않는다.
- Dev history를 수동 수정하지 않는다.
- 이 변경의 dev 검증과 다른 기능 이슈의 구현 상태를 결합하지 않는다.

**Verification**

- 최신 main Docker Build, Deploy Dev Argo CD PreSync Job과 API/Web Rollout 결과를 확인한다.
- 같은 release 또는 후속 sync의 migration no-op과 history name/hash count 불변을 확인한다.

- [x] 3.1 후속 PR에 실패 원인, runner 계약 정정과 자동 검증 결과를 기록하고 merge한다.
- [x] 3.2 Merge 뒤 dev PreSync migration과 API/Web Rollout 성공을 관찰한다.
- [x] 3.3 같은 release 또는 후속 sync에서 no-op 재실행과 history/schema 불변을 확인한다.
- [x] 3.4 운영 증거를 PROD-656에 기록한 뒤 이슈 완료와 OpenSpec archive를 판단한다.
