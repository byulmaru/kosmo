> **Superseded runtime classification (2026-08-16, PROD-780):** 이 delta의 GraphQL-only RLS principal 및 `kosmo_worker BYPASSRLS` 설명은 `unify-application-runtime-postgres-role`이 대체한다. 두 역할의 기존 ACL/default ACL과 non-owner/금지권한 계약은 PROD-781까지 유지되지만, current application workload는 `kosmo_worker LOGIN NOBYPASSRLS` 하나를 사용한다. 아래 내용은 PROD-724 당시 ACL 계약과 검증 이력이다.

## ADDED Requirements

### Requirement: 두 runtime principal은 application schema를 사용할 수 있다

**Authority / Provenance:** `docs/operations/production-migrations.md`, PROD-724, PROD-369, PROD-780, PROD-781. 시스템은 rollback window 동안 legacy `kosmo_api`와 shared application runtime `kosmo_worker` 모두에게 `kosmo` database의 `public` schema `USAGE`를 유지해야 한다(MUST). Current application workload는 `kosmo_worker LOGIN NOBYPASSRLS` 하나를 사용하며(MUST), 이 object ACL 계약은 role attribute나 workload credential source를 변경해서는 안 된다(MUST NOT).

#### Scenario: legacy API principal ACL을 rollback window 동안 유지한다

- **WHEN** `kosmo_api`가 `public` application table을 이름으로 참조한다
- **THEN** schema `USAGE` 부족으로 접근이 거부되지 않아야 한다
- **AND** 이 ACL의 제거는 PROD-781 contract 전에는 수행하지 않아야 한다

#### Scenario: shared application principal이 application schema를 사용한다

- **WHEN** `kosmo_worker`가 `public` application table을 이름으로 참조한다
- **THEN** schema `USAGE` 부족으로 접근이 거부되지 않아야 한다
- **AND** 역할의 `NOBYPASSRLS` 속성이 유지되어야 한다

### Requirement: 현재 application table 전체에 공통 CRUD DML을 부여한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, PROD-724. 시스템은 migration 적용 시점의 `public` application table 전체에 대해 `kosmo_api`와 `kosmo_worker` 모두에게 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 부여해야 한다(MUST). 역할별 table 최소권한 allowlist를 만들거나 두 역할의 table DML 집합을 다르게 구성해서는 안 된다(MUST NOT).

#### Scenario: 기존 application table의 공통 DML

- **WHEN** migration이 현재 schema에 적용된다
- **THEN** 두 runtime 역할은 모든 `public` application table에 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 가져야 한다

#### Scenario: shared runtime은 기존 object ACL을 소비한다

- **WHEN** `kosmo_worker`가 application table에서 DML을 실행한다
- **THEN** object ACL은 DML 실행 자격을 제공해야 한다
- **AND** application visibility와 owner policy는 application 계층이 결정해야 한다

#### Scenario: legacy ACL은 shared runtime ACL과 동일하게 유지된다

- **WHEN** rollback window 동안 `kosmo_api`와 `kosmo_worker`의 table ACL을 비교한다
- **THEN** `kosmo_api`와 같은 table-level CRUD DML 집합을 사용해야 한다
- **AND** ACL/default ACL removal은 PROD-781 전에는 수행하지 않아야 한다

### Requirement: owner가 만드는 future table에 공통 default ACL을 적용한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, PROD-724, PROD-616. 시스템은 `ALTER DEFAULT PRIVILEGES FOR ROLE kosmo IN SCHEMA public`을 사용해 owner `kosmo`가 이후 만드는 table에 두 runtime 역할의 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 부여해야 한다(MUST). 이 default ACL은 다른 owner 또는 다른 schema의 객체에 적용되어서는 안 된다(MUST NOT).

#### Scenario: owner가 새 application table을 만든다

- **WHEN** owner `kosmo`가 migration에서 `public` table을 새로 만든다
- **THEN** 새 table은 `kosmo_api`와 `kosmo_worker`의 공통 CRUD DML ACL을 가져야 한다

#### Scenario: 다른 owner 또는 schema는 범위 밖이다

- **WHEN** `kosmo`가 아닌 역할이 객체를 만들거나 `public` 밖의 schema에 객체가 만들어진다
- **THEN** 이 변경의 default ACL이 해당 객체에 적용되어서는 안 된다

### Requirement: application object ownership과 금지 권한을 보존한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, PROD-724, PROD-616. application object owner는 `kosmo`로 유지되어야 한다(MUST). 시스템은 `kosmo_api` 또는 `kosmo_worker`에 object ownership, grant option, schema `CREATE`, DDL 권한, `TRUNCATE`, `REFERENCES`, `TRIGGER`를 부여해서는 안 된다(MUST NOT).

#### Scenario: migration 뒤 owner와 금지 권한을 검사한다

- **WHEN** migration 적용 뒤 catalog ACL과 ownership을 검사한다
- **THEN** application object owner는 `kosmo`여야 한다
- **AND** 두 runtime 역할은 허용된 schema `USAGE`와 CRUD DML 이외의 금지 권한을 가져서는 안 된다

#### Scenario: runtime 역할은 권한을 재위임할 수 없다

- **WHEN** 두 runtime 역할의 ACL을 검사한다
- **THEN** 어떤 application object privilege에도 grant option이 없어야 한다

### Requirement: sequence와 migration history는 공통 ACL 범위에서 제외한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, PROD-724, PROD-616. 현재 application table이 UUID 기본값을 사용하는 동안 이 변경은 application sequence ACL을 추가해서는 안 된다(MUST NOT). `drizzle` migration history schema와 table은 runtime 역할의 공통 ACL 대상이 아니어야 한다(MUST NOT). 후속 migration이 sequence 또는 identity를 도입하면 그 migration이 필요한 runtime ACL을 함께 선언해야 한다(MUST).

#### Scenario: 현재 schema에는 application sequence grant가 없다

- **WHEN** 현재 전체 migration을 빈 database에 replay한다
- **THEN** 이 변경은 두 runtime 역할에 application sequence 권한을 부여하지 않아야 한다

#### Scenario: migration history는 runtime에서 접근할 수 없다

- **WHEN** `kosmo_api` 또는 `kosmo_worker`의 `drizzle` schema와 migration history table 권한을 검사한다
- **THEN** 이 변경으로 부여된 접근 권한이 없어야 한다

### Requirement: 권한 migration은 독립적으로 검증하고 production 작업과 분리한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, PROD-724, PROD-616, PROD-369. 권한 변경은 기존 `kosmo_migration` credential로 연결하고 `SET ROLE kosmo`를 수행하는 migration 경계를 사용해야 한다(MUST). Application migration은 `kosmo_api` 또는 `kosmo_worker` 역할을 생성하거나 속성을 변경해서는 안 되며(MUST NOT), disposable 검증 환경은 PROD-369과 동등한 비소유 fixture 역할을 migration 전에 준비해야 한다(MUST). local/disposable full replay와 비운영 catalog·대표 DML 검증이 완료 조건이어야 한다(MUST). Production preflight, sync/apply, cutover와 post-apply live 검증은 별도 명시 승인 대상이며 이 capability의 구현·OpenSpec 완료 또는 archive 조건이어서는 안 된다(MUST NOT).

#### Scenario: 빈 database에서 전체 migration을 replay한다

- **WHEN** disposable PostgreSQL cluster에 PROD-369과 동등한 두 fixture 역할을 준비하고 기존 migration runner가 빈 database에서 모든 migration을 실행한다
- **THEN** 권한 migration은 owner `kosmo` 경계에서 성공해야 한다
- **AND** 현재 table ACL, future table default ACL, ownership과 금지 권한 검사가 통과해야 한다

#### Scenario: application migration은 runtime 역할을 소유하지 않는다

- **WHEN** 권한 migration의 SQL과 disposable role bootstrap을 검토한다
- **THEN** role 생성과 role attribute 설정은 test-only bootstrap 또는 PROD-369 provisioning에만 있어야 한다
- **AND** application migration에는 `CREATE ROLE`, `ALTER ROLE` 또는 credential 값이 없어야 한다

#### Scenario: 비운영 역할로 대표 DML을 검증한다

- **WHEN** 비운영 환경에서 두 runtime 역할로 대표 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 실행한다
- **THEN** object ACL 때문에 실패하지 않아야 한다
- **AND** 금지된 DDL·ownership·재위임은 거부되어야 한다

#### Scenario: OpenSpec을 완료하거나 archive한다

- **WHEN** 구현, 정적 검증과 요구된 비운영 검증이 완료된다
- **THEN** production 작업 없이 이 capability를 완료하고 archive할 수 있어야 한다
- **AND** 완료·merge·archive가 production 작업을 승인해서는 안 된다
