# post-rls-base Specification

## Purpose

TBD - created by archiving change add-post-rls-base. Update Purpose after archive.

## Requirements

### Requirement: Post와 Post Content RLS base는 owner 동작을 보존한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `memory/database-migrations.md`, `docs/operations/production-migrations.md`, PROD-368, PROD-370 — The database MUST preserve the owner workload while enabling the Post RLS base. 시스템은 `post`와 `post_content`에 ROW LEVEL SECURITY를 활성화해야 한다. 이 base 단계는 table owner에 `FORCE ROW LEVEL SECURITY`를 적용하지 않아야 하며, API/system policy나 grant를 만들지 않아야 한다. 따라서 기존 owner workload의 SELECT와 DML 결과는 migration 전과 동일해야 하고, policy가 아직 없는 non-owner는 두 테이블의 행을 읽거나 변경할 수 없어야 한다.

#### Scenario: 기존 owner workload

- **WHEN** base migration 뒤 table owner가 기존 Post와 Post Content SELECT 및 DML을 실행한다
- **THEN** migration 전과 같은 행을 읽고 같은 허용된 변경을 수행한다

#### Scenario: policy 없는 non-owner 조회

- **WHEN** 필요한 table privilege가 있지만 BYPASSRLS와 owner membership이 없고 관련 policy도 없는 role이 Post 또는 Post Content를 조회한다
- **THEN** 조회 결과에는 행이 노출되지 않는다

#### Scenario: policy 없는 non-owner 변경

- **WHEN** 필요한 table privilege가 있지만 BYPASSRLS와 owner membership이 없고 관련 policy도 없는 role이 Post 또는 Post Content를 INSERT, UPDATE 또는 DELETE한다
- **THEN** PostgreSQL RLS가 변경을 허용하지 않는다

### Requirement: transaction actor context를 안전하게 조회한다

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-368, PROD-370, PROD-708 — The database MUST expose safe read-only actor context helpers. 시스템은 후속 API/system policy가 같은 방식으로 Account ID와 Profile ID transaction setting을 읽을 수 있는 조회 전용 database helper를 제공해야 한다. helper는 setting이 없거나 빈 문자열이거나 PostgreSQL UUID로 해석할 수 없는 값이면 오류를 던지지 않고 `NULL`을 반환해야 하며, 유효한 UUID이면 해당 UUID를 반환해야 한다. helper는 setting을 생성하거나 변경하지 않아야 하고, session 또는 transaction 바깥으로 actor 값을 보존하지 않아야 한다.

#### Scenario: setting 누락

- **WHEN** Account ID 또는 Profile ID setting이 정의되지 않은 transaction에서 helper를 호출한다
- **THEN** helper는 오류 없이 `NULL`을 반환한다

#### Scenario: 빈 setting

- **WHEN** Account ID 또는 Profile ID setting이 빈 문자열인 transaction에서 helper를 호출한다
- **THEN** helper는 오류 없이 `NULL`을 반환한다

#### Scenario: 잘못된 setting

- **WHEN** Account ID 또는 Profile ID setting이 PostgreSQL UUID가 아닌 값인 transaction에서 helper를 호출한다
- **THEN** helper는 오류 없이 `NULL`을 반환한다

#### Scenario: 유효한 setting

- **WHEN** Account ID 또는 Profile ID setting이 유효한 PostgreSQL UUID인 transaction에서 helper를 호출한다
- **THEN** helper는 동일한 UUID를 반환한다

### Requirement: 후속 Post policy join 경로는 index로 검증된다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/instance.md`, `docs/domain/policies/post-list.md`, `memory/database-design.md`, PROD-368, PROD-370 — The implementation MUST verify every concrete downstream policy join path against PostgreSQL indexes. 시스템은 후속 policy가 사용할 Post → Author Profile → Instance, Post Content → Post, viewer Profile → Author Profile의 established Follow Relationship, Repost Source Post 경로를 PostgreSQL execution plan으로 검증해야 한다. 현재 schema의 primary key, unique index 또는 일반 index가 구체 경로를 지원하면 중복 index를 추가하지 않아야 하고, 지원하지 않는 경로에만 additive index를 추가해야 한다.

#### Scenario: policy join/index 검증

- **WHEN** 대표 데이터가 있는 PostgreSQL에서 각 후속 policy join 경로의 execution plan을 확인한다
- **THEN** 각 lookup은 해당 join key를 선두로 사용할 수 있는 기존 또는 이번 migration의 index를 사용하고 불필요한 중복 index는 존재하지 않는다

### Requirement: base migration은 독립 검증 및 rollback 경계를 가진다

**Authority / Provenance:** `memory/database-migrations.md`, `docs/operations/production-migrations.md`, PROD-368, PROD-370 — The base migration MUST remain independently deployable and reversible within the repository's forward-only migration contract. base migration은 기존 row를 rewrite하거나 API/system policy, grant, credential, SQL handle 또는 애플리케이션 predicate를 변경하지 않는 additive Expand 단위여야 한다. 빈 database replay와 기존 owner data 회귀를 통과해야 하며, rollback은 후속 policy나 workload 전환과 결합하지 않고 RLS 비활성화와 이 base가 추가한 helper/index 제거만으로 이전 owner schema 행동을 복구할 수 있어야 한다. 저장소는 production에서 자동 down migration을 실행하지 않아야 한다.

#### Scenario: 독립 배포

- **WHEN** base migration만 기존 owner workload가 사용하는 database에 적용한다
- **THEN** 기존 data와 owner workload를 유지하면서 RLS metadata와 context helper만 준비된다

#### Scenario: 독립 rollback 판단

- **WHEN** 후속 policy와 workload transition 전에 base를 되돌려야 한다
- **THEN** data backfill이나 credential rollback 없이 RLS 비활성화와 base 전용 database object 제거로 이전 owner 동작을 복구할 수 있다
