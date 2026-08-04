## Why

PROD-656의 파일별 transaction runner는 기존 Drizzle history가 로컬 migration 정렬의 prefix라고 가정했지만, 병렬 브랜치가 생성 시각과 다른 순서로 merge·배포되면 정상 history도 그 순서를 따르지 않는다. PR #495 병합 뒤 dev PreSync Job이 name·hash가 모두 일치하는 30개 migration을 순서 차이만으로 거부했으므로, 기존 Drizzle의 name 기반 적용 의미를 보존하면서 hash 무결성과 파일별 transaction을 함께 유지해야 한다.

## What Changes

- 적용된 migration을 DB row 위치가 아니라 고유한 name과 hash의 대응으로 검증한다.
- DB 적용 순서가 로컬 timestamp 정렬과 달라도 모든 적용 name이 로컬에 존재하고 hash가 같으면 유효하게 인식한다.
- 이미 적용된 name을 제외한 migration만 version-control 순서로 선택해 파일별 transaction으로 실행한다.
- name이 없는 legacy history는 row 위치가 아니라 기존 Drizzle과 호환되는 timestamp/hash 매핑으로 승격한다.
- 로컬에 없는 history, 같은 name의 hash 변경, 중복 name/history는 SQL 실행 전에 거부한다.
- 실제 dev와 동등한 비선형 history regression과 process smoke를 추가하고, dev PreSync 성공 및 no-op 재실행 전에는 PROD-656을 완료하지 않는다.
- active migration spec과 운영 문서의 strict-prefix 표현을 name/hash 집합 호환 계약으로 수정한다.

## Authority / Provenance

- Canonical: `docs/operations/production-migrations.md`, `memory/database-migrations.md`
- Linear Contract: `PROD-269`
- Linear Implementations: `PROD-656`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `dev-database-migrations`: 기존 Drizzle history 호환성과 pending 선택을 strict prefix가 아니라 name/hash 집합으로 정의한다.
- `production-migration-gate`: production `migrate` command도 같은 name/hash 호환성과 파일별 transaction 계약을 사용하도록 정정한다.

## Impact

- `packages/core/db/migrate.ts`의 history 검증, legacy 승격과 pending 선택
- `packages/core/db/migrate.test.ts`, `packages/core/db/migrate.smoke.test.ts`의 existing-history regression
- `docs/operations/production-migrations.md`, `memory/database-migrations.md`
- `openspec/specs/dev-database-migrations/spec.md`, `openspec/specs/production-migration-gate/spec.md`
- dev Argo CD PreSync migration Job의 재검증과 no-op 관찰
