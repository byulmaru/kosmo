## ADDED Requirements

### Requirement: 기존 runtime 연결과 rendered manifest 보존

**Authority / Provenance:** Linear `PROD-709` — 시스템은 `api` 또는 `fedify` credential selector를 활성화하지 않은 기존 Helm values에서 API Rollout, Web BFF/inbound Fedify와 migration의 현재 연결 경계를 그대로 렌더해야 한다(MUST). Selector 지원만 배포한 release는 기존 rendered manifest를 byte-identical하게 유지해야 하며(MUST), database role, Secret, endpoint 또는 런타임 client/connection 동작을 바꾸어서는 안 된다(MUST NOT).

#### Scenario: 기존 values byte identity

- **WHEN** `postgres.credentials.api`와 `postgres.credentials.fedify`를 모두 비활성화한 기존 values로 Helm manifest를 렌더한다
- **THEN** API와 Web BFF는 현재 CloudNativePG owner `-app` Secret과 read-write Service 기반 `DATABASE_URL`/`DATABASE_PASSWORD`를 그대로 사용하고, Web에는 selector가 만든 `FEDIFY_DATABASE_*`가 없으며, 전체 rendered output은 selector 이전 baseline과 byte-identical하다

#### Scenario: migration 경계 보존

- **WHEN** API 또는 Fedify selector 없이 dev/prod migration Job을 렌더한다
- **THEN** dev는 기존 owner fallback을 사용하고 production은 기존 migration Secret과 `kosmo_migration` login → `SET ROLE kosmo` 경계를 유지한다

### Requirement: API credential source는 API Rollout과 Web BFF가 공유한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-369` — 시스템은 하나의 API PostgreSQL URL과 password Secret source를 API Rollout과 Web BFF 기본 DB 연결에 공통으로 선택할 수 있어야 한다(MUST). API와 Web에 서로 다른 API 인증 source를 만들거나(MUST NOT), API source를 Fedify source로 재사용해서는 안 된다(MUST NOT).

#### Scenario: API source 선택

- **WHEN** `postgres.credentials.api`의 URL과 password Secret trio를 모두 채운다
- **THEN** API Rollout과 Web BFF 기본 `DATABASE_URL`/`DATABASE_PASSWORD`가 같은 API source를 참조하고, 두 workload에 별도 Web API source가 렌더되지 않는다

#### Scenario: API source rollback

- **WHEN** API trio를 세 값 모두 제거하고 image와 Fedify 설정을 유지한다
- **THEN** API Rollout과 Web BFF 기본 연결만 기존 owner source로 함께 돌아가며 Web inbound Fedify `FEDIFY_DATABASE_*` 선택은 바뀌지 않는다

### Requirement: Fedify source는 현재 Web inbound Fedify에만 추가한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`, `PROD-719` — 시스템은 Web 프로세스의 현재 inbound Fedify consumer에 별도 PostgreSQL URL과 password Secret source를 제공할 수 있어야 한다(MUST). 이 source는 Web BFF 기본 `DATABASE_URL`을 덮어쓰거나 API Rollout에 주입되어서는 안 된다(MUST NOT).

#### Scenario: Web inbound Fedify source 선택

- **WHEN** `postgres.credentials.fedify`의 URL과 password Secret trio를 모두 채운다
- **THEN** Web Rollout에만 `FEDIFY_DATABASE_PASSWORD` SecretKeyRef와 `FEDIFY_DATABASE_URL`이 추가되고 API Rollout에는 `FEDIFY_DATABASE_*`가 없으며 Web BFF 기본 `DATABASE_*`는 API source를 유지한다

#### Scenario: Fedify source rollback

- **WHEN** Fedify trio를 세 값 모두 제거하고 API 설정을 유지한다
- **THEN** Web의 `FEDIFY_DATABASE_*` 입력만 제거되고 API Rollout과 API/Web BFF 기본 연결은 바뀌지 않는다

#### Scenario: API Fedify env 금지

- **WHEN** API-only, Fedify-only 또는 양쪽 selector를 각각 활성화해 manifest를 검토한다
- **THEN** API Rollout에는 어떤 조합에서도 `FEDIFY_DATABASE_URL` 또는 `FEDIFY_DATABASE_PASSWORD`가 렌더되지 않는다

### Requirement: 각 역할 selector는 additive atomic trio다

**Authority / Provenance:** Linear `PROD-709` — 시스템은 `api`와 `fedify` 각각의 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key` 세 값을 하나의 선택 단위로 검증해야 한다(MUST). 일부 값만 설정된 source는 owner fallback과 custom 값을 섞어서는 안 되며(MUST NOT) 명확한 Helm render 오류로 거부해야 한다(MUST).

#### Scenario: 완전한 trio 선택

- **WHEN** 하나의 역할에 URL, Secret name과 Secret key를 모두 설정한다
- **THEN** 해당 역할만 custom source를 참조하고 Secret value는 values나 rendered manifest에 나타나지 않는다

#### Scenario: 불완전한 trio 거부

- **WHEN** API 또는 Fedify source에 URL 또는 Secret name/key 중 하나 이상만 설정한다
- **THEN** Helm render는 실패하고 `postgres.credentials.api` 또는 `postgres.credentials.fedify` source를 식별하는 오류를 반환하며 owner fallback과 custom 값의 혼합 manifest를 만들지 않는다

### Requirement: migration은 runtime selector와 독립된 기존 경계를 사용한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-709`, `PROD-564` — 시스템은 `migration` runtime 역할을 API/Fedify selector와 별도 설정 경계로 유지해야 한다(MUST). Runtime selector는 migration credential, role transition 또는 실행 순서를 암묵적으로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: runtime 입력만 변경

- **WHEN** API 또는 Fedify trio를 opt-in하고 migration 설정을 변경하지 않는다
- **THEN** dev migration owner fallback과 production `kosmo_migration` login/Secret 및 `SET ROLE kosmo` 계약은 그대로 유지된다

#### Scenario: migration render 불변

- **WHEN** API-only, Fedify-only, 양쪽 활성화와 각 selector rollback의 dev/prod migration Job을 비교한다
- **THEN** 각 migration document의 env, Secret ref, `DATABASE_MIGRATION_ROLE`과 role transition이 baseline과 byte-identical하다
