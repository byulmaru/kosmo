## MODIFIED Requirements

### Requirement: migration은 runtime selector와 독립된 기존 경계를 사용한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `docs/operations/postgres-session-pool.md`, `memory/database-migrations.md`, `memory/script.md`, Linear `PROD-709`, `PROD-564`, `PROD-712` — 시스템은 `migration` runtime 역할을 API/Fedify selector와 별도 설정 경계로 유지해야 한다(MUST). Migration은 모든 환경에서 CNPG-managed owner credential을 직접 사용해야 하며(MUST), runtime selector는 migration credential 또는 실행 순서를 암묵적으로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Runtime 입력만 변경

- **WHEN** API 또는 Fedify trio를 opt-in하고 migration 설정을 변경하지 않는다
- **THEN** dev와 production migration의 `PGUSER=kosmo`, CNPG-generated application-user Secret과 owner 직접 연결 계약은 그대로 유지된다
- **AND** 별도 migration login, runtime Secret fallback 또는 role transition이 생겨서는 안 된다

#### Scenario: Migration render 불변

- **WHEN** API-only, Fedify-only, 양쪽 활성화와 각 selector rollback의 dev/prod migration Job을 비교한다
- **THEN** 각 migration document의 owner env와 CNPG-generated application-user SecretRef는 baseline과 byte-identical하다
- **AND** `DATABASE_MIGRATION_ROLE`, `kosmo_migration`과 runtime credential SecretRef가 나타나서는 안 된다
